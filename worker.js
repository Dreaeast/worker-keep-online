// Cloudflare worker for keeping services alive by periodic visits
// After copying this code to your workers, modify the required URLs or add environment variables

// Environment variable configuration: All settings below can be overridden by environment variables
// Telegram configuration (optional)
const TG_ID = globalThis['TG_ID'] || '';                // Set your Telegram chat_id in environment variable 'TG_ID'
const TG_TOKEN = globalThis['TG_TOKEN'] || '';          // Set your Telegram Bot token in environment variable 'TG_TOKEN'

// GitHub configuration
const GITHUB_TOKEN = globalThis['GITHUB_TOKEN'] || '';  // Set your GitHub personal access token in environment variable 'GITHUB_TOKEN'
const GITHUB_REPO = globalThis['GITHUB_REPO'] || '';    // Set your repository name in format 'username/repo' in environment variable 'GITHUB_REPO'
const GITHUB_BRANCH = globalThis['GITHUB_BRANCH'] || 'main'; // Set your branch name in environment variable 'GITHUB_BRANCH'

// Default URLs for 24-hour access can be added as environment variables: URL_1, URL_2, URL_3...
const defaultUrls = [];

// Default websites for specific time period access (1:00～5:00) can be added as environment variables: WEBSITE_1, WEBSITE_2, WEBSITE_3...
const defaultWebsites = [];

// URL file paths in GitHub repository (can be overridden by environment variables)
const URL_24H_FILE = globalThis['URL_24H_FILE'] || 'url.yaml';
const TIME_URL_FILES = globalThis['TIME_URL_FILES'] ? globalThis['TIME_URL_FILES'].split(',') : ['url1.yaml', 'url2.yaml', 'url3.yaml'];

// Time configuration (can be overridden by environment variables)
const PAUSE_START_HOUR = parseInt(globalThis['PAUSE_START_HOUR'] || '1');
const PAUSE_END_HOUR = parseInt(globalThis['PAUSE_END_HOUR'] || '6');
const TIMEZONE = globalThis['TIMEZONE'] || 'Asia/Hong_Kong';

// Get URLs from environment variables
function getUrlsFromEnv(prefix) {
  const envUrls = [];
  let index = 1;
  while (true) {
    const url = globalThis[`${prefix}${index}`];
    if (!url) break;
    envUrls.push(url);
    index++;
  }
  return envUrls;
}

// Get file from GitHub repository with multiple methods
async function getFileFromGitHub(path) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    console.log('GitHub configuration incomplete, skipping GitHub URL retrieval');
    return '';
  }

  const username = GITHUB_REPO.split('/')[0];
  const repo = GITHUB_REPO.split('/')[1];
  
  if (!username || !repo) {
    console.error(`Invalid GITHUB_REPO format: ${GITHUB_REPO}. Expected format: username/repo`);
    return '';
  }

  // Try API method first
  try {
    console.log(`Attempting to fetch ${path} via GitHub API...`);
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw',
        'User-Agent': 'CloudflareWorker'
      }
    });

    if (apiResponse.ok) {
      const content = await apiResponse.text();
      console.log(`Successfully retrieved ${path} from GitHub API (${content.length} bytes)`);
      return content;
    } else {
      console.log(`GitHub API method failed with status ${apiResponse.status}. Trying raw URL method...`);
    }
  } catch (apiError) {
    console.error(`Error with GitHub API method: ${apiError.message}. Trying raw URL method...`);
  }

  // If API method fails, try raw URL method
  try {
    // For private repos, we can use a different URL format that accepts the token as a query parameter
    // This works for both public and private repos
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;
    
    const rawResponse = await fetch(rawUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'CloudflareWorker'
      }
    });

    if (rawResponse.ok) {
      const content = await rawResponse.text();
      console.log(`Successfully retrieved ${path} from GitHub raw URL (${content.length} bytes)`);
      return content;
    } else {
      // If that fails too, try one more method that sometimes works for private repos
      console.log(`Raw URL method failed with status ${rawResponse.status}. Trying alternate method...`);
      
      const altUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/blobs/${await getBlobSha(path)}`;
      const altResponse = await fetch(altUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'CloudflareWorker'
        }
      });
      
      if (altResponse.ok) {
        const content = await altResponse.text();
        console.log(`Successfully retrieved ${path} using blob method (${content.length} bytes)`);
        return content;
      } else {
        console.error(`All GitHub access methods failed for ${path}. Last status: ${altResponse.status}`);
        return '';
      }
    }
  } catch (rawError) {
    console.error(`Error with GitHub raw URL method: ${rawError.message}`);
    return '';
  }
}

// Helper function to get blob SHA for a file
async function getBlobSha(path) {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/git/trees/${GITHUB_BRANCH}?recursive=1`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'CloudflareWorker'
      }
    });
    
    if (!response.ok) {
      console.error(`Could not get repository tree: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const file = data.tree.find(item => item.path === path);
    
    if (file) {
      return file.sha;
    } else {
      console.error(`File ${path} not found in repository tree`);
      return null;
    }
  } catch (error) {
    console.error(`Error getting blob SHA: ${error.message}`);
    return null;
  }
}

// Parse content to extract URLs
function parseUrlsFromContent(content) {
  if (!content) return [];
  
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')) // Filter empty lines and comments
    .filter(url => {
      try {
        new URL(url); // Validate URL format
        return true;
      } catch (e) {
        console.error(`Invalid URL: ${url}`);
        return false;
      }
    });
}

// Get URL lists from GitHub
async function getUrlsFromGitHub() {
  // Get 24-hour URLs from URL_24H_FILE
  const url24hContent = await getFileFromGitHub(URL_24H_FILE);
  const url24hList = parseUrlsFromContent(url24hContent);
  console.log(`Retrieved ${url24hList.length} 24-hour URLs from GitHub (${URL_24H_FILE})`);
  
  // Get time-specific URLs from TIME_URL_FILES
  let timeUrlList = [];
  
  for (const file of TIME_URL_FILES) {
    const content = await getFileFromGitHub(file);
    const urls = parseUrlsFromContent(content);
    if (urls.length > 0) {
      console.log(`Retrieved ${urls.length} URLs from GitHub (${file})`);
      timeUrlList = [...timeUrlList, ...urls];
    }
  }
  
  console.log(`Total of ${timeUrlList.length} time-specific URLs retrieved from GitHub`);
  
  return {
    url24hList,
    timeUrlList
  };
}

// Check if current hour is in pause time
function isInPauseTime(hour) {
  return hour >= PAUSE_START_HOUR && hour < PAUSE_END_HOUR;
}

// Send message to Telegram
async function sendToTelegram(message) {
  if (!TG_TOKEN || !TG_ID) return;
  
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TG_ID,
    text: message,
    parse_mode: 'HTML'
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      console.error(`Telegram push failed: ${response.statusText}`);
    } else {
      console.log('Telegram message sent successfully');
    }
  } catch (error) {
    console.error(`Telegram push error: ${error.message}`);
  }
}

// Generate random IP
function getRandomIP() {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Generate random Chrome version
function getRandomVersion() {
  const chromeVersion = Math.floor(Math.random() * (131 - 100 + 1)) + 100;
  return chromeVersion;
}

// Get random User-Agent
function getRandomUserAgent() {
  const agents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${getRandomVersion()}.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${getRandomVersion()}.0.0.0 Safari/537.36`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/${getRandomVersion()}.0.0.0`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1`
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

async function axiosLikeRequest(url, index, retryCount = 0) {
  try {
    // Random delay 1-6 seconds
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 5000));
    
    const config = {
      method: 'get',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'X-Forwarded-For': getRandomIP(),
        'X-Real-IP': getRandomIP(),
        'Origin': 'https://glitch.com',
        'Referer': 'https://glitch.com/'
      },
      redirect: 'follow',
      timeout: parseInt(globalThis['REQUEST_TIMEOUT'] || '30000')
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const response = await fetch(url, {
      ...config,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const status = response.status;
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: TIMEZONE });
    
    if (status !== 200) {
      // Send notification for non-200 status codes
      await sendToTelegram(`<b>Keep-alive Log:</b> ${timestamp}\n<b>Access Failed:</b> ${url}\n<b>Status Code:</b> ${status}`);
    }
    
    return {
      index,
      url,
      status,
      success: status === 200,
      timestamp
    };
    
  } catch (error) {
    if (retryCount < parseInt(globalThis['MAX_RETRIES'] || '2')) {
      // Retry if error count is less than MAX_RETRIES
      await new Promise(resolve => setTimeout(resolve, 10000));
      return axiosLikeRequest(url, index, retryCount + 1);
    }
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: TIMEZONE });
    // Send error notification
    await sendToTelegram(`<b>Keep-alive Log:</b> ${timestamp}\n<b>Access Error:</b> ${url}\n<b>Error Message:</b> ${error.message}`);
    console.error(`${timestamp} Access Failed: ${url} Status Code: 500`);
    return {
      index,
      url,
      status: 500,
      success: false,
      timestamp
    };
  }
}

async function handleScheduled() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
  const hour = now.getHours();
  const timestamp = now.toLocaleString();
  
  console.log(`Starting scheduled task: ${timestamp}`);
  
  // Get URL lists from GitHub
  const githubUrls = await getUrlsFromGitHub();
  
  // Combine all 24-hour access URL sources
  const allUrls = [
    ...defaultUrls,
    ...getUrlsFromEnv('URL_'),
    ...(githubUrls.url24hList || [])
  ].filter(url => url); // Filter out empty URLs
  
  // Combine all time-specific access URL sources
  const allWebsites = [
    ...defaultWebsites,
    ...getUrlsFromEnv('WEBSITE_'),
    ...(githubUrls.timeUrlList || [])
  ].filter(url => url); // Filter out empty URLs
  
  console.log(`Total 24-hour access URLs: ${allUrls.length}`);
  console.log(`Total time-specific access URLs: ${allWebsites.length}`);

  // Execute 24-hour access tasks - parallel but maintain order
  if (allUrls.length > 0) {
    const results = await Promise.all(allUrls.map((url, index) => axiosLikeRequest(url, index)));
    
    // Sort by original order and print results
    results.sort((a, b) => a.index - b.index).forEach(result => {
      if (result.success) {
        console.log(`${result.timestamp} Access successful: ${result.url}`);
      } else {
        console.error(`${result.timestamp} Access failed: ${result.url} Status code: ${result.status}`);
      }
    });
  } else {
    console.log('No 24-hour URLs configured. Skipping 24-hour access tasks.');
  }

  // Check if in pause time
  if (!isInPauseTime(hour)) {
    console.log(`Current time ${hour}:00, executing time-specific access tasks`);
    if (allWebsites.length > 0) {
      const websiteResults = await Promise.all(allWebsites.map((url, index) => axiosLikeRequest(url, index)));
      
      websiteResults.sort((a, b) => a.index - b.index).forEach(result => {
        if (result.success) {
          console.log(`${result.timestamp} Access successful: ${result.url}`);
        } else {
          console.error(`${result.timestamp} Access failed: ${result.url} Status code: ${result.status}`);
        }
      });
    } else {
      console.log('No time-specific URLs configured. Skipping time-specific access tasks.');
    }
  } else {
    console.log(`Currently in pause time ${PAUSE_START_HOUR}:00-${PAUSE_END_HOUR}:00 --- ${timestamp}, skipping time-specific access tasks`);
  }
  
  console.log(`Scheduled task completed: ${new Date().toLocaleString('zh-CN', { timeZone: TIMEZONE })}`);
  
  // Send status summary to Telegram if enabled
  if (globalThis['SEND_SUMMARY'] === 'true') {
    await sendToTelegram(`<b>Keep-alive Summary:</b> ${timestamp}\n<b>24-hour URLs:</b> ${allUrls.length}\n<b>Time-specific URLs:</b> ${allWebsites.length}\n<b>Task completed</b>`);
  }
}

// Handle HTTP requests
async function handleRequest() {
  return new Response("Worker is running!", {
    headers: { 'content-type': 'text/plain' },
  });
}

// Listen for requests
addEventListener('fetch', event => {
  event.respondWith(handleRequest());
});

// Listen for scheduled tasks
addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled());
});
