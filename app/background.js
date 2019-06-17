const getCookieAsync = (url, name) =>
    new Promise(resolve => chrome.cookies.get({ url, name }, cookie => resolve(cookie)));
const setCookieAsync = (url, name, value, expirationDate) =>
    new Promise(resolve =>
        chrome.cookies.set({ url, name, value, expirationDate }, cookie => resolve(cookie))
    );

chrome.runtime.onMessage.addListener((action, sender, respond) => {
    (async () => {
        switch (action.type) {
            case 'cookie/set': {
                const { url, name, expirationDate, value } = action.payload;
                await setCookieAsync(url, name, value, expirationDate);
                respond();
                break;
            }
            case 'cookie/get': {
                const { url, name } = action.payload;
                const cookie = await getCookieAsync(url, name);
                respond(cookie);
                break;
            }
            default:
        }
    })();

    return true;
});

chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.sync.set({ timeout: 5 });
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
        chrome.declarativeContent.onPageChanged.addRules([
            {
                conditions: [
                    new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: { hostEquals: 'poe.trade' }
                    })
                ],
                actions: [new chrome.declarativeContent.ShowPageAction()]
            }
        ]);
    });
});
