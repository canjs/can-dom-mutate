var unit = require('steal-qunit');
var domMutate = require('../can-dom-mutate');

unit.module('can-dom-mutate');

unit.test('testing works', function (assert) {
	assert.ok(domMutate);
});
