const sendMessageAsync = (type, payload) =>
    new Promise(resolve =>
        chrome.runtime.sendMessage({ type, payload }, response => resolve(response))
    );
const getStorageAsync = (...keys) =>
    new Promise(resolve => chrome.storage.sync.get([...keys], params => resolve(params)));
const setStorageAsync = (key, value) =>
    new Promise(resolve => chrome.storage.sync.set({ [key]: value }, params => resolve(params)));

class Cookies {
    static key = 'ptw:data';
    static expiry = 9000000000; // a really long time

    static getAsync() {
        return sendMessageAsync('cookie/get', { url: location.origin, name: Cookies.key });
    }

    static async get() {
        try {
            let { data } = await getStorageAsync('data');

            if (data) {
                data = JSON.parse(LZString.decompressFromEncodedURIComponent(data));
            } else {
                data = {};
            }

            return data;
        } catch (error) {
            throw new Error(error);
        }
    }

    static setAsync(value) {
        return sendMessageAsync('cookie/set', {
            url: location.origin,
            name: Cookies.key,
            expirationDate: Cookies.expiry,
            value
        });
    }

    static async set(data) {
        try {
            const payload = LZString.compressToEncodedURIComponent(JSON.stringify(data));
            // console.log('set:', data);
            // console.log(`saving ${payload.length / 1000}KB`);
            await setStorageAsync('data', payload);
        } catch (error) {
            throw new Error(error);
        }
    }
}

class App {
    dataManager;
    items = {};
    timeout = 5;

    constructor() {
        this.save = _.debounce(this._save.bind(this), 1000);
        this.initialize();
        setInterval(this.tick.bind(this), 10000);
    }

    tick() {
        const changed = this.dataManager.resetExpiredItems(this.timeout);
        changed.forEach(id => {
            const item = this.items[id];
            item.update(0);
        });
        if (changed.length > 0) {
            this.save();
        }
        // console.log('tick', this.dataManager.state);
    }

    async initialize() {
        try {
            await this.load();
            this.dataManager.resetExpiredItems(this.timeout);

            $('.item').forEach(element => {
                const item = this.addItem(element);
                const { w } = this.dataManager.getItem(item.id);
                item.update(w);
            });

            $(document).on('click', '.item', this.onItemClick.bind(this));
            chrome.storage.onChanged.addListener(this.onStorageChanged.bind(this));
        } catch (error) {
            throw new Error(error);
        }
    }

    async _save() {
        try {
            await Cookies.set(this.dataManager.getUnique());
        } catch (error) {
            throw new Error(error);
        }
    }

    async load() {
        try {
            const data = await Cookies.get();
            const { timeout } = await getStorageAsync('timeout');
            this.timeout = timeout || 5;
            this.dataManager = new DataManager(data);
            await this.save();
        } catch (error) {
            throw new Error(error);
        }
    }

    addItem(element) {
        const item = new ItemElement(element);
        if (!this.dataManager.hasItem(item.id)) {
            this.dataManager.addItem(item.id);
        }
        if (!this.hasItem(item.id)) {
            this.items[item.id] = item;
        }
        return item;
    }

    hasItem(id) {
        return id in this.items;
    }

    getItem(id) {
        if (this.hasItem(id)) {
            return this.items[id];
        }
        return undefined;
    }

    onItemClick(event) {
        const element = event.currentTarget;
        const $element = $(element);
        const ign = ItemElement.getIgn($element);
        const id = ItemElement.getId($element);
        let item;

        if (this.dataManager.hasItem(id)) {
            this.dataManager.addWhisper(id);
            item = this.getItem(id);
        } else {
            item = this.addItem(element);
        }

        const { w } = this.dataManager.getItem(item.id);
        item.update(w);
        this.save();
    }

    onStorageChanged(changed) {
        Object.entries(changed).forEach(([key, value]) => {
            switch (key) {
                case 'timeout':
                    this.timeout = value.newValue;
                    // console.log(`timeout is now ${this.timeout}`);
                    break;
                default:
            }
        });
    }
}

class DataManager {
    state = {};

    constructor(data) {
        this.set(data);
    }

    addItem(item, whispers = 0) {
        if (this.hasItem(item)) {
            return;
        }

        this.state[item] = this.getModel(whispers);
    }

    removeItem(item) {
        if (this.hasItem(item)) {
            delete this.state[item];
        }
    }

    getItem(item) {
        if (this.hasItem(item)) {
            return this.state[item];
        }
        return undefined;
    }

    addWhisper(item) {
        if (this.hasItem(item)) {
            this.state[item].w++;
        }
        return this.state[item];
    }

    hasItem(item) {
        return item in this.state;
    }

    get() {
        return this.state;
    }

    getUnique() {
        return Object.fromEntries(Object.entries(this.state).filter(([key, value]) => value.w > 0));
    }

    resetExpiredItems(timeout) {
        const changedItems = [];

        Object.entries(this.state).forEach(([id, item]) => {
            if (item.w === 0) {
                return;
            }

            const expiredDate = dayjs(item.d).add(timeout, 'minute');
            const expired = dayjs().isAfter(expiredDate);

            if (expired) {
                changedItems.push(id);
                this.state[id].w = 0;
            }
        });

        return changedItems;
    }

    getModel(whispers) {
        return {
            w: whispers,
            d: new Date().getTime()
        };
    }

    set(data) {
        if (data) {
            this.state = data;
        } else {
            this.state = {};
        }
    }
}

class ItemElement {
    $element;
    id;
    ign;
    whisperElement;

    constructor(element) {
        this.$element = $(element);
        this.initialize();
    }

    initialize() {
        this.whisperElement = new WhisperElement(this.$element.find('ul.proplist .whisper-btn'));
        this.id = ItemElement.getId(this.$element);
        this.ign = ItemElement.getIgn(this.$element);
    }

    hasId() {
        return typeof this.id !== 'undefined';
    }

    update(count) {
        this.whisperElement.setCount(count);
    }

    static getId($element) {
        const className = $element
            .attr('class')
            .split(' ')
            .find(element => element.includes('item-live'));
        return className ? className.substring(className.lastIndexOf('-') + 1) : undefined;
    }

    static getIgn($element) {
        return $element.data('ign');
    }
}

class WhisperElement {
    $element;
    count;
    baseText;

    constructor(element) {
        this.$element = $(element);
        this.baseText = this.$element.text();
    }

    setCount(count) {
        this.count = count;
        this.$element.html(`${this.baseText}&nbsp;(${this.count})`);
    }
}

new App();
