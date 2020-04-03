import puppeteer from 'puppeteer-extra'
import StealthPlugin = require('puppeteer-extra-plugin-stealth')
import path = require('path')
import { Browser } from 'puppeteer'
import yargs = require('yargs')
import perkUpgrade, { DefaultUpgradingStrategy } from './perk-upgrade'

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
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let browser: Browser
;(async () => {
	const userDataDir = path.join(__dirname, '../user_data')
	browser = await puppeteer.use(StealthPlugin()).launch({
		headless: argv.headless,
		args: [`--user-data-dir=${userDataDir}`]
	})
	browser.on('disconnected', () => {
		console.log('Bot: browser closed')
		process.exit()
	})
	process.on('SIGINT', () => browser.close())
	const page = await browser.newPage()
	async function login() {
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
			const href = (await page.$eval(
				selectors[argv.login as LoginMethod],
				el => el.getAttribute('href')
			)) as string
			await page.goto(href, {
				waitUntil: 'networkidle0'
			})
			await page.waitForSelector('#header_my_avatar', {
				timeout: 120 * 1000
			})
			console.log('Login: manual login success')
		}
	}
	await login()
	const userName = await page.$eval('#chat input[name=name]', el =>
		el.getAttribute('value')
	)
	console.log(`Bot: user is ${userName}`)
	const job = async () => {
		console.log('JobRunner: job start')
		await login()
		const time = await perkUpgrade(page, DefaultUpgradingStrategy)
		console.log(`JobRunner: next job will run after ${time / 1000} seconds`)
		console.log('JobRunner: job done')
		await sleep(time)
		await job()
	}
	await job()
})().catch(err => {
	console.error(err)
	console.log('Bot: unexpected error occurred')
})
