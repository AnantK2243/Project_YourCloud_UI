// tests/frontend-setup.js - Setup for frontend tests

// Import TextEncoder/TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Setup localStorage mock with proper Jest spy functions
const createStorageMock = () => {
    const storage = {};
    
    return {
        getItem: jest.fn((key) => storage[key] || null),
        setItem: jest.fn((key, value) => {
            storage[key] = String(value);
        }),
        removeItem: jest.fn((key) => {
            delete storage[key];
        }),
        clear: jest.fn(() => {
            Object.keys(storage).forEach(key => delete storage[key]);
        }),
        get length() {
            return Object.keys(storage).length;
        },
        key: jest.fn((index) => Object.keys(storage)[index] || null)
    };
};

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

// Mock DOM environment for frontend utilities
global.window = {
    location: {
        origin: 'https://127.0.0.1:4200',
        protocol: 'https:',
        host: '127.0.0.1:4200',
        hostname: '127.0.0.1',
        port: '4200',
        href: 'https://127.0.0.1:4200/'
    },
    sessionStorage: sessionStorageMock,
    localStorage: localStorageMock,
    atob: str => Buffer.from(str, 'base64').toString('binary'),
    btoa: str => Buffer.from(str, 'binary').toString('base64'),
    navigator: {
        userAgent: 'test'
    },
    document: {
        createElement: jest.fn(() => ({}))
    }
};

global.localStorage = localStorageMock;
global.sessionStorage = sessionStorageMock;

// Mock crypto.subtle for tests
global.crypto = {
    subtle: {
        generateKey: jest.fn(),
        importKey: jest.fn(),
        exportKey: jest.fn(),
        encrypt: jest.fn(),
        decrypt: jest.fn(),
        digest: jest.fn()
    },
    getRandomValues: jest.fn(arr => {
        // Fill with mock random values
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    })
};

// Mock Angular testing utilities
global.Zone = {
    current: {
        run: jest.fn((fn) => fn())
    }
};

// Reset mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
});
