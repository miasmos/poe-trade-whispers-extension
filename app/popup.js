const timeoutField = $('#timeout');

chrome.storage.sync.get(['timeout'], ({ timeout }) => {
    timeoutField.val(timeout || 5);
});

timeoutField.change(event => {
    const value = event.target.value;

    if (isNaN(value)) {
        return;
    }
    chrome.storage.sync.set({ timeout: Number(value) });
});
