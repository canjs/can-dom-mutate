var unit = require('steal-qunit');
var domMutate = require('../../node');
var domEvents = require('can-dom-events');
var testUtils = require('../test-utils');

var removedEvent = require('../../events/removed');
domEvents.addEvent(removedEvent);

var test = unit.test;
var moduleMutationObserver = testUtils.moduleMutationObserver;

moduleMutationObserver('can-dom-mutate/events/removed', function () {
	test('should fire removed event when node is removed', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');
		parent.appendChild(child);

		domEvents.addEventListener(child, 'removed', function onRemoved (event) {
			assert.equal(event.type, 'removed', 'Should be the removed event');
			assert.equal(event.target, child, 'Should target the removed element');

			done();
		});

		domMutate.removeChild.call(parent, child);
	});
});
