// crontab -e
// 0 */6 * * * cd /path/to/your/project && node slack.ts >> /path/to/your/project/cron-rotation.log 2>&1

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';

const CONFIG_PATH = path.resolve(__dirname, './slack-config.yaml');

interface SlackConfig {
    slack: {
        app_id: string;
        access_token: string;
        refresh_token: string;
    };
}

async function rotateSlackTokens(): Promise<void> {
    console.log(`[${new Date().toISOString()}] 🔄 Starting automated token rotation...`);

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`❌ Configuration file not found at: ${CONFIG_PATH}`);
        process.exit(1);
    }

    const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = YAML.parse(fileContents) as SlackConfig;
    const oldRefreshToken = config.slack.refresh_token;

    try {
        // 1. Fire native fetch POST request with URL-encoded parameters
        const response = await fetch('https://slack.com', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({refresh_token: oldRefreshToken}),
        });

        // 2. Fetch doesn't throw on error status codes (like 400 or 500), so we check manually
        if (!response.ok) {
            throw new Error(`HTTP Error Status: ${response.status}`);
        }

        // 3. Extract and parse the JSON payload
        const data = (await response.json()) as any;

        if (!data.ok) {
            throw new Error(`Slack API rejection: ${data.error}`);
        }

        // 4. Update memory object mappings
        config.slack.access_token = data.token;
        config.slack.refresh_token = data.refresh_token;

        // 5. Serialize back into clean YAML format
        const updatedYaml = YAML.stringify(config);
        fs.writeFileSync(CONFIG_PATH, updatedYaml, 'utf8');

        console.log(`✅ Token chain advanced natively. Updated file at: ${CONFIG_PATH}`);
    } catch (error: any) {
        console.error(`❌ Token rotation dropped out:`, error.message);
        process.exit(1);
    }
}

// Execute logic
rotateSlackTokens();
