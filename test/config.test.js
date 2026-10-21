import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults and is not configured', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('values typed in a form are turned into numbers and kept in range', () => {
  const config = normalizeConfig({
    poll_frequency: '10',
    boost_delta: '9',
    boost_duration: '45.4',
    hot_water_boost_duration: 'abc',
  });
  assert.equal(config.poll_frequency, 30, 'the hub is not read more than twice a minute');
  assert.equal(config.boost_delta, 5);
  assert.equal(config.boost_duration, 45);
  assert.equal(config.hot_water_boost_duration, DEFAULT_CONFIG.hot_water_boost_duration);
});

test('a pasted URL keeps the host only, and the secret is trimmed', () => {
  const config = normalizeConfig({
    hub_host: ' http://192.168.1.40:80/data/v2/domain/ ',
    hub_secret: ' abc== \n',
  });
  assert.equal(config.hub_host, '192.168.1.40:80');
  assert.equal(config.hub_secret, 'abc==');
  assert.equal(isConfigured(config), true);
});

test('an unknown protocol falls back to automatic', () => {
  assert.equal(normalizeConfig({ hub_protocol: 'HTTPS' }).hub_protocol, 'https');
  assert.equal(normalizeConfig({ hub_protocol: 'ftp' }).hub_protocol, 'auto');
});
