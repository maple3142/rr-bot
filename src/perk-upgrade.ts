import { Page } from 'puppeteer'

enum Perk {
	STR = 1,
	EDU = 2,
	END = 3
}
export interface PerkUpgradingStrategy {
	determineWhichToUpgrade(str: number, edu: number, end: number): Perk
}
export const DefaultUpgradingStrategy = {
	determineWhichToUpgrade(str: number, edu: number, end: number): Perk {
		if (end < 50) return Perk.END
		if (str < 50) return Perk.STR
		if (edu < 50) return Perk.EDU
		if (end < 100) return Perk.END
		if (str < 100) return Perk.STR
		if (edu < 100) return Perk.EDU
		if (str / end > 2) return Perk.END
		if (str / edu > 1) return Perk.EDU
		return Perk.STR
	}
}
function parseTime(time: string) {
	if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
		const [h, m, s] = time.split(':').map(Number)
		return h * 3600 + m * 60 + s
	} else if (/^\d{2}:\d{2}/.test(time)) {
		const [m, s] = time.split(':').map(Number)
		return m * 60 + s
	} else {
		throw new Error('Invalid time format')
	}
}
async function getDurationString(page: Page): Promise<string | null> {
	const counter = await page.$('#perk_counter_2')
	if (counter) {
		const duration = ((await counter.evaluate(
			(el) => el.textContent
		)) as string).trim()
		return duration
	}
	return null
}
export default async (page: Page, strategy: PerkUpgradingStrategy) => {
	const duration = await getDurationString(page)
	if (duration) {
		console.log(`PerkUpgrade: remaining ${duration}`)
		return parseTime(duration) * 1000 + 10000 // plus 10s
	}
	await page.waitFor('.perk_source_2')
	const str = (await page.$eval(
		'.perk_source_2[perk="1"]',
		(el) => el.textContent
	)) as string
	const edu = (await page.$eval(
		'.perk_source_2[perk="2"]',
		(el) => el.textContent
	)) as string
	const end = (await page.$eval(
		'.perk_source_2[perk="3"]',
		(el) => el.textContent
	)) as string
	const upg = strategy.determineWhichToUpgrade(
		parseInt(str.trim()),
		parseInt(edu.trim()),
		parseInt(end.trim())
	)
	console.log(
		`PerkUpgrade: upgrade ${upg === 1 ? 'STR' : upg === 2 ? 'EDU' : 'END'}`
	)
	const perkEntrySelector = `#index_perks_list>.perk_item[perk="${upg}"]`
	await page.waitFor(perkEntrySelector)
	await page.$eval(perkEntrySelector, (el) => (<any>el).click())
	const upgradeBtnSelector = '#perk_target_4>.perk_select>.perk_3>div'
	await page.waitFor(upgradeBtnSelector)
	await page.$eval(upgradeBtnSelector, (el) => (<any>el).click())
	await page.waitFor('#perk_counter_2')
	return 300 * 1000 // wait for 5 minutes and check the time
}
