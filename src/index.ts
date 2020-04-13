import puppeteer from 'puppeteer-extra'
import StealthPlugin = require('puppeteer-extra-plugin-stealth')
import path = require('path')
import { Browser, Page } from 'puppeteer'
import yargs = require('yargs')
import perkUpgrade, { DefaultUpgradingStrategy } from './perk-upgrade'
import { writeFile, readFile, pathExists } from 'fs-extra'

const argv = yargs
	.locale('en')
	.option('login', {
		alias: 'l',
		describe: 'Login method',
		string: true,
		choices: ['facebook', 'google', 'vk'],
		required: true
	})
	.option('headless', {
		alias: 'h',
		describe: 'Headless mode',
		boolean: true,
		default: false
	}).argv

type LoginMethod = 'facebook' | 'google' | 'vk'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let browser: Browser
;(async () => {
	console.log('Bot: starting browser')
	browser = await puppeteer.use(StealthPlugin()).launch({
		headless: argv.headless
	})
	console.log('Bot: browser started')
	browser.on('disconnected', () => {
		console.log('Bot: browser closed')
		process.exit()
	})
	process.on('SIGINT', () => browser.close())
	const page = await browser.newPage()
	async function persistCookies(page: Page, cookiePath: string) {
		const cookies = await page.cookies(
			'https://rivalregions.com/',
			'https://www.facebook.com/',
			'https://accounts.google.com/',
			'https://oauth.vk.com/'
		)
		await writeFile(cookiePath, JSON.stringify(cookies))
		console.log('Cookie: successfully wrote cookies to cookies.json')
	}
	async function loadCookies(page: Page, cookiePath: string) {
		if (await pathExists(cookiePath)) {
			const cookies = JSON.parse(await readFile(cookiePath, 'utf-8'))
			await page.setCookie(...cookies)
			console.log('Cookie: successfully loaded from cookies.json')
		}
	}
	async function login(page: Page) {
		const selectors = {
			facebook: '.sa_link[href*="facebook.com"]',
			google: '.sa_link[href*="google.com"]',
			vk: '.sa_link[href*="vk.com"]'
		}
		if (!(argv.login in selectors)) {
			throw new TypeError('Invalid login method')
		}
		await page.goto('https://rivalregions.com/#overview', {
			waitUntil: 'networkidle0'
		})
		if (!(await page.$('#header_my_avatar'))) {
			console.log('Login: not logged in, manual login required')
			const href = await page.$eval(
				selectors[argv.login as LoginMethod],
				(el) => (<any>el).href
			)
			await page.goto(href)
			await page.waitForResponse(
				(resp) => {
					const url = resp.url()
					return (
						url.includes('https://rivalregions.com/main/fblogin') ||
						url.includes(
							'https://rivalregions.com/rival/googles'
						) ||
						url.includes('https://rivalregions.com/main/vklogin')
					)
				},
				{
					timeout: 0
				}
			)
			await page.waitFor('#chat input[name=name]')
			console.log('Login: manual login success')
			return true // true means manual login is used
		}
		return false
	}
	const cookiePath = path.join(__dirname, '../cookies.json')
	await loadCookies(page, cookiePath)
	if (await login(page)) {
		await persistCookies(page, cookiePath)
	}
	const userName = await page.$eval('#chat input[name=name]', (el) =>
		el.getAttribute('value')
	)
	console.log(`Bot: user is ${userName}`)
	const job = async () => {
		console.log('JobRunner: job start')
		if (await login(page)) {
			await persistCookies(page, cookiePath)
		}
		const time = await perkUpgrade(page, DefaultUpgradingStrategy)
		console.log(`JobRunner: next job will run after ${time / 1000} seconds`)
		console.log('JobRunner: job done')
		await sleep(time)
		await job()
	}
	await job()
})().catch((err) => {
	console.error(err)
	console.log('Bot: unexpected error occurred')
})
