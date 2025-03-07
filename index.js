const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs').promises;
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const express = require('express');

const app = express();
const port = process.env.PORT || 8080;


// Telegram Bot Token and Chat ID
const CHAT_ID = '-4726759675';
const bot = new TelegramBot(process.env.BOT_TOKEN);

const STORAGE_FILE = 'lastPost.json';

async function saveLastPost(post) {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(post));
}

async function getLastPost() {
    try {
        const data = await fs.readFile(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null; // Return null if file doesn't exist or can't be read
    }
}


async function checkForNewPosts() {
    console.log('Launching browser...');
    // const browser = await puppeteer.launch({ headless: false });

    try {
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();


        console.log('Forum monitor is running...');
        const urls = ['https://www.sponser.co.il/ForumViewUserMessages.aspx?UserId=5609&ForumId=2&IsFull=0']

        let myproduct = []

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
                await page.goto(`${url}`, { waitUntil: 'networkidle0', timeout: 60000 });
                try {
                    await page.waitForSelector('#forumThread', { timeout: 30000 });
                    const courses = await page.$$eval('#forumThread', (elements) =>
                        elements.map((e) => ({
                            latestPostTitle: e.querySelector('li:nth-child(2) > article > article > header > article > a > h2').innerText,
                            latestPostMsg: e.querySelector('li:nth-child(2) > article > article > section > section > article').innerText,
                        }))
                    );

                    myproduct.push(...courses)

                } catch (selectorError) {
                    console.error('Selector not found:', selectorError);
                    await bot.sendMessage(CHAT_ID, `Selector not found: ${selectorError.message}`);
                    return;
                }

            } catch (gotoError) {
                console.error(`Error navigating to ${url}:`, gotoError);
                await bot.sendMessage(CHAT_ID, `Error navigating to ${url}: ${gotoError.message}`);
                return; // Stop processing this URL
            }

        }
        
        const lastStoredPost = await getLastPost();


        if (!lastStoredPost || myproduct.latestPostTitle !== lastStoredPost.latestPostTitle) {
            // New post found
            const message = `הודעה חדשה מהדר:\nכותרת: ${myproduct[0].latestPostTitle}\nהודעה: ${myproduct[0].latestPostMsg} \n קישור להודעה: ${urls[0]}`;
            await bot.sendMessage(CHAT_ID, message);

            // Save the new post info
            await saveLastPost(myproduct);
        } else {
            console.log('No new posts.');
        }


        await browser.close()

    } catch (error) {
        console.error('Failed to launch browser:', error);
        // Send error to telegram.
        await bot.sendMessage(CHAT_ID, `Error: ${error.message}`);
        return; // Exit the function to prevent further errors
    }


}
async function runPeriodicChecks() {
    while (true) {
        await checkForNewPosts();
        // Wait for 5 minutes
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
}

// Start the periodic checks
runPeriodicChecks().catch(console.error);

// Add a route to manually trigger checks
app.get('/check', async (req, res) => {
    await checkForNewPosts();
    res.send('Check completed');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
