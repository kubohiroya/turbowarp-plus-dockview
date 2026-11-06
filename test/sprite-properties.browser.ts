import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const origin = 'http://layout.test';
const files = new Map([
    ['/example/sprite-properties.html', new URL('../example/sprite-properties.html', import.meta.url)],
    ['/example/sprite-properties.js', new URL('../example/sprite-properties.js', import.meta.url)],
    ['/dist/sprite-properties.js', new URL('../dist/sprite-properties.js', import.meta.url)],
    ['/src/sprite-properties.css', new URL('../src/sprite-properties.css', import.meta.url)],
    ...['react', 'react-dom'].map(name => [
        `/${name}.umd.js`, path.join(path.dirname(require.resolve(name + '/package.json')), 'umd', name + '.development.js')
    ])
]);

let browser;
before(async () => {
    browser = await chromium.launch({executablePath: process.env.SPRITE_PROPERTIES_CHROME});
});
after(() => browser?.close());

async function withFixture(run) {
    const page = await browser.newPage({viewport: {width: 1200, height: 850}});
    try {
        await page.route(origin + '/**', async route => {
            const {pathname} = new URL(route.request().url());
            if (pathname === '/react.js') return route.fulfill({contentType: 'application/javascript',
                body: 'export default window.React; export const {useRef, useState} = window.React;'});
            const file = files.get(pathname);
            if (!file) return route.fulfill({status: 404});
            const contentType = pathname.endsWith('.html') ? 'text/html' :
                pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
            return route.fulfill({contentType, body: await readFile(file)});
        });
        await page.goto(origin + '/example/sprite-properties.html');
        await page.getByRole('region', {name: 'Sprite properties'}).waitFor();
        await run(page);
    } finally {
        await page.close();
    }
}

const resize = (page, width, height) => page.evaluate(([w, h]) => {
    window.spriteFixture.resize(w, h);
}, [width, height]);
const fields = page => page.locator('.tw-sprite-properties__fields > .tw-sprite-properties__field');
const boxes = page => fields(page).evaluateAll(elements => elements.map(element => {
    const {x, y, width, right} = element.getBoundingClientRect();
    return {x, y, width, right};
}));

test('panel width drives 1-row, 1-column and wrapped layouts in English and Japanese', () => withFixture(async page => {
    for (const [locale, name] of [['en', 'Sprite name'], ['ja', 'スプライト名']]) {
        await page.evaluate(language => window.spriteFixture.changeLocale(language), locale);
        await page.getByRole('textbox', {name, exact: true}).waitFor();

        await resize(page, 900, 140);
        const initial = await boxes(page);
        assert.equal(initial.length, 6);
        assert.equal(new Set(initial.map(box => box.y)).size, 1);
        assert.equal(new Set(initial.map(box => box.x)).size, 6);
        await resize(page, 1060, 140);
        const wider = await boxes(page);
        assert.equal(wider[0].width - initial[0].width, 160);
        for (const index of [1, 4]) {
            assert.equal(wider[index + 1].x - wider[index].right, initial[index + 1].x - initial[index].right);
            assert.ok(wider[index + 1].x - wider[index].right <= 10);
        }

        await resize(page, 210, 520);
        const narrow = await boxes(page);
        assert.equal(new Set(narrow.map(box => box.x)).size, 1);
        assert.equal(new Set(narrow.map(box => box.y)).size, 6);
        await resize(page, 490, 300);
        const medium = await boxes(page);
        assert.ok(new Set(medium.map(box => box.y)).size > 1);
        assert.ok(new Set(medium.map(box => box.x)).size > 1);
        assert.equal(await page.locator('.tw-sprite-properties').evaluate(element =>
            element.scrollWidth <= element.clientWidth
        ), true);
    }
    await resize(page, 210, 145);
    assert.equal(await page.locator('.tw-sprite-properties').evaluate(element =>
        element.scrollHeight > element.clientHeight && element.scrollWidth <= element.clientWidth
    ), true);
}));

test('reflow retains drafts and focus, keyboard order stays stable, Enter and blur commit once', () => withFixture(async page => {
    const name = page.getByRole('textbox', {name: 'Sprite name'});
    await name.fill('Renamed cat');
    await resize(page, 210, 520);
    assert.equal(await name.inputValue(), 'Renamed cat');
    assert.equal(await name.evaluate(element => element === element.ownerDocument.activeElement), true);
    await name.press('Enter');
    await page.getByRole('spinbutton', {name: 'x', exact: true}).focus();
    await resize(page, 900, 140);
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), [
        {id: 'Cat', patch: {name: 'Renamed cat'}}
    ]);
    for (const width of [900, 210]) {
        await resize(page, width, 520);
        await name.focus();
        const keyboardOrder = [];
        for (let index = 0; index < 7; index++) {
            keyboardOrder.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label')));
            await page.keyboard.press('Tab');
        }
        assert.deepEqual(keyboardOrder, ['Sprite name', 'x', 'y', 'Visibility', 'Size', 'Direction', 'Rotation style']);
    }
}));

test('all properties are committed against one target, stale drafts are discarded, stage is disabled', () => withFixture(async page => {
    const name = page.getByRole('textbox', {name: 'Sprite name'});
    const x = page.getByRole('spinbutton', {name: 'x', exact: true});
    const y = page.getByRole('spinbutton', {name: 'y', exact: true});
    const visibility = page.getByRole('combobox', {name: 'Visibility'});
    const size = page.getByRole('spinbutton', {name: 'Size'});
    const direction = page.getByRole('spinbutton', {name: 'Direction'});
    const rotation = page.getByRole('combobox', {name: 'Rotation style'});

    await name.fill('Discard this draft');
    await page.evaluate(() => window.spriteFixture.select('Dog'));
    await page.waitForFunction(() => document.querySelector('#panel input').value === 'Dog');
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), []);
    await page.evaluate(() => window.spriteFixture.update('Dog', {x: 15.75}));
    await page.waitForFunction(() => document.querySelector('#panel input[aria-label="x"]').value === '16');
    assert.equal(await x.inputValue(), '16');

    await name.fill('New Dog');
    await name.press('Enter');
    await x.fill('-12.5');
    await y.fill('22');
    await y.press('Tab');
    await visibility.selectOption('false');
    await size.fill('75');
    await direction.fill('-45');
    await direction.press('Tab');
    await rotation.selectOption("don't rotate");
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits), [
        {id: 'Dog', patch: {name: 'New Dog'}},
        {id: 'Dog', patch: {x: -12.5}},
        {id: 'Dog', patch: {y: 22}},
        {id: 'Dog', patch: {visible: false}},
        {id: 'Dog', patch: {size: 75}},
        {id: 'Dog', patch: {direction: -45}},
        {id: 'Dog', patch: {rotationStyle: "don't rotate"}}
    ]);

    await x.fill('');
    await x.press('e');
    await x.press('Enter');
    assert.equal(await page.evaluate(() => window.spriteFixture.edits.length), 7);

    await x.fill('');
    await x.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.spriteFixture.edits.at(-1)), {id: 'Dog', patch: {x: 0}});

    await name.fill('Uncommitted stage switch');
    await page.evaluate(() => window.spriteFixture.select('Stage'));
    await page.waitForFunction(() => document.querySelector('#panel input').disabled);
    assert.equal(await page.locator('#panel :is(input,select):disabled').count(), 7);
    assert.equal(await page.evaluate(() => window.spriteFixture.edits.length), 8);
}));
