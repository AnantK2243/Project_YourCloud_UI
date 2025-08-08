// tests/vitest.setup.ts - global setup for Vitest (frontend)

import 'reflect-metadata';
import { TextEncoder, TextDecoder } from 'node:util';
import { webcrypto as nodeWebCrypto } from 'node:crypto';
import 'zone.js';
import 'zone.js/testing';
import { TestBed } from '@angular/core/testing';
import {
	BrowserDynamicTestingModule,
	platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

if (typeof (globalThis as any).TextEncoder === 'undefined') {
	(globalThis as any).TextEncoder = TextEncoder;
}
if (typeof (globalThis as any).TextDecoder === 'undefined') {
	(globalThis as any).TextDecoder = TextDecoder as any;
}

if (typeof (globalThis as any).crypto === 'undefined') {
	(globalThis as any).crypto = nodeWebCrypto as any;
}

beforeAll(() => {
	try {
		TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
	} catch {}
});

afterAll(() => {
	try {
		TestBed.resetTestEnvironment();
	} catch {}
});

// Ensure a stable JSDOM URL
if (typeof window !== 'undefined') {
	try {
		// Access to href forces jsdom to initialize location
		void window.location.href;
	} catch {
		// noop
	}
}
