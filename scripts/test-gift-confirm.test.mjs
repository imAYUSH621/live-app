import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../server/src/schema.sql', import.meta.url), 'utf8');
const wallet = fs.readFileSync(new URL('../server/src/routes/wallet.js', import.meta.url), 'utf8');
const gifts = fs.readFileSync(new URL('../server/src/services/gifts.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../web/src/live/GiftPanel.jsx', import.meta.url), 'utf8');

test('gift_confirmations table is one-use, price-bound and expiring', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS gift_confirmations/);
  assert.match(schema, /used BOOLEAN NOT NULL DEFAULT false/);
  assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(schema, /coins INT NOT NULL/);
});

test('POST /gifts/confirm mints a token against the current price', () => {
  assert.match(wallet, /r\.post\('\/gifts\/confirm'/);
  assert.match(wallet, /crypto\.randomBytes\(24\)/);
  assert.match(wallet, /now\(\) \+ interval '60 seconds'/);
  assert.match(wallet, /const coins = gift\.price \* qty;/);
});

test('bulk sends (qty > 1) require confirmation; single sends do not', () => {
  assert.match(gifts, /if \(qty > 1\) \{/);
  assert.match(gifts, /'confirm_needed'/);
  assert.match(gifts, /AND NOT used AND expires_at > now\(\)/);
  assert.match(gifts, /user_id=\$2 AND gift_id=\$3 AND qty=\$4 AND coins=\$5/);
  assert.match(gifts, /SET used=true/);
});

test('route passes confirm_token through to the service', () => {
  assert.match(wallet, /confirmToken: typeof b\.confirm_token === 'string'/);
});

test('client shows the total review dialog before bulk send', () => {
  assert.match(panel, /e\.code === 'confirm_needed'/);
  assert.match(panel, /api\('\/gifts\/confirm'/);
  assert.match(panel, /setConfirm\(\{ token: c\.token/);
  assert.match(panel, /gift-confirm-overlay/);
  assert.match(panel, /send\(c\.isCombo, c\.token\)/);
});
