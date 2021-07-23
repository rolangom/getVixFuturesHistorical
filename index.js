const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { URLSearchParams } = require('url');
require('dotenv').config();

const months = 'January,February,March,April,May,June,July,August,September,October,November,December'.split(',');

const buildSuccessfullPath = (dowloadPath) => `${dowloadPath}/vix-futures-historical-p.csv`;

const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 
 * @param {string} inputDateStr 
 * @returns {string}
 */
 function buildDate(inputDateStr) {
  const [year, monthn, day] = inputDateStr.split('-');
  const newMonthn = Number(monthn) - 1;
  return `${months[newMonthn]} ${day.padStart(2, '0')}, ${year}`;
}

async function clearInputDate(page) {
  await page.evaluate(() => document.getElementById("date1").value = "")
}

/**
 * 
 * @param {string} dateStr 
 * @returns {Promise<string>}
 */
 async function processDate(dateStr) {
  const browser = await puppeteer.launch(); // { headless: false }
  const page = await browser.newPage();
  await page.goto('http://vixcentral.com/', {
    waitUntil: 'networkidle2',
  });
  await page.setViewport({
    width: 900,
    height: 900,
    deviceScaleFactor: 1,
  });

  const newDownloadPath = `./download_/` + Date.now().toString(36) + '_' + (Math.random() * 10).toFixed(0);

  await page._client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.resolve(newDownloadPath),
  });
  // 
  await page.click('#ui-id-10'); // historical prices tab
  console.log('dateStr', dateStr);
  const newDateFormated = buildDate(dateStr);
  console.log('newDateFormated', newDateFormated);
  await clearInputDate(page);
  await page.type('#date1', newDateFormated);
  await page.click('#b4');
  // Wait to get the refreshed data
  await timeout(2500);
  //  Fixed positions in the meanwhile
  await page.mouse.click(801, 175, { button: 'left' });
  await page.mouse.click(662, 376, { button: 'left' });
  // Wait after download ends
  await timeout(2500);
  await page.close();
  await browser.close();
  const successfullPath = buildSuccessfullPath(newDownloadPath)
  const data = await fs.promises.readFile(successfullPath, 'utf8');
  ensureValidDate(data, newDateFormated);
  console.log('Fin ' + dateStr);
  // delete file and folder
  await fs.promises.rm(
    successfullPath.slice(0, successfullPath.lastIndexOf('/')),
    { recursive: true, force: true }
  ).catch(err => console.error('ignore', err));
  // await fs.promises.unlink(successfullPath).catch(err => console.error('ignore', err));
  return data;
}

/**
 * 
 * @param {string} data 
 * @param {string} reqDate 
 */
function ensureValidDate(data, reqDate) {
  const lines = data.split('\n');
  const [line0] = lines;
  const dateCol = line0.slice(line0.indexOf(',')+1).replace(/"/g, "");
  if (dateCol != reqDate) {
    throw Error(`Date '${reqDate}'not found.`);
  }
}

/**
 * 
 * @param {number} i 
 * @returns {string}
 */
function buildContratTimeStr(i) {
  switch(i) {
    case 0: return 'VX_F';
    default: return `VX_${i}`;
  }
}

/**
 * 
 * @param {string} date 
 * @param {number} i 
 * @param {string[]} param2 
 * @param {Client} client
 */
async function insertLine(date, i, [dte, nivel], client) {
  const contractTime = buildContratTimeStr(i);
  const insertSQL = `INSERT INTO public.futures_hist_prices(fecha, tiempo_contrato, dte, nivel) VALUES (TO_DATE($1, 'YYYY-MM-DD'), $2, $3, $4)`;
  return await client.query(insertSQL, [date, contractTime, Number(dte), Number(nivel)]);
}

/**
 * 
 * @param {string} date 
 * @param {Client} client 
 */
async function handleDate(date, client) {
  const rawData = await processDate(date);
  const rowLines = rawData.split('\n').slice(1).map(row => row.split(','));
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM public.futures_hist_prices WHERE fecha = TO_DATE($1, 'YYYY-MM-DD')`, [date]);
    await Promise.all(rowLines.map((row, i) => insertLine(date, i, row, client)));
    return await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err
  }
}

/**
 * 
 * @param {Date} date 
 * @param {number} days 
 * @returns {Date}
 */
function addDays(date, days) {
  const newDate = new Date(date.getTime());
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * Increase days when friday to reach monday otherwise one day
 * @param {Date} date
 * @returns {Date}
 */
function getNextWorkingDay(date) {
  return addDays(date, date.getDay() == 5 ? 3 : 1);
}

const defaultDate = new Date('2008-10-16');

/**
 * 
 * @param {Client} client 
 * @returns {Promise<Date>}
 */
async function getNextDate(client) {
  const res = await client.query('SELECT MAX(fecha) maxDate FROM futures_hist_prices');
  const nextDate = res.rows[0].maxdate instanceof Date ? getNextWorkingDay(res.rows[0].maxdate) : defaultDate;
  return nextDate;
}

async function init(argv) {
  const args = argv[2];
  const params = new URLSearchParams(args);
  const fromDateStr = params.get('from');
  const toDateStr = params.get('to');
  const client = new Client();
  await client.connect();
  const nextDate = fromDateStr ? new Date(fromDateStr) : await getNextDate(client);
  let datei = nextDate;
  const dateEnd = toDateStr ? new Date(toDateStr) : addDays(new Date(), -1);
  while (datei < dateEnd) {
    await handleDate(datei.toJSON().slice(0, 10), client).catch(console.error); // Ignore when no data
    datei = getNextWorkingDay(datei);
  }
  await client.end();
}

init(process.argv).then(console.log, console.error);


