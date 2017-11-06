var unit = require('steal-qunit');
var domMutate = require('../../node');
var domEvents = require('can-dom-events');
var testUtils = require('../test-utils');

var insertedEvent = require('../../events/inserted');
domEvents.addEvent(insertedEvent);

var test = unit.test;
var moduleMutationObserver = testUtils.moduleMutationObserver;

moduleMutationObserver('can-dom-mutate/events/inserted', function () {
	test('should fire inserted event when node is inserted', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		domEvents.addEventListener(child, 'inserted', function onInserted (event) {
			assert.equal(event.type, 'inserted', 'Should be the inserted event');
			assert.equal(event.target, child, 'Should target the inserted element');

			done();
		});

		domMutate.appendChild.call(parent, child);
	});
});
