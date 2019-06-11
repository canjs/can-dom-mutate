var unit = require('steal-qunit');
var domEvents = require('can-dom-events');
var domMutate = require('../can-dom-mutate');
var domMutateDomEvents = require('./events');
var node = require('../node/node');
var testUtils = require('../test/test-utils');

var test = unit.test;

testUtils.moduleWithMutationObserver('can-dom-mutate/dom-events', function () {
	QUnit.test('inserted', function (assert) {
		var done = assert.async();
		var fixture = testUtils.getFixture();
		var parent = document.createElement('div');
		var child = document.createElement('p');
		var parentInsertedHandler,
			childInsertedHandler,
			removeOnInsertionHandler;

		// add inserted event to registry
		domEvents.addEvent(domMutateDomEvents.inserted);

		var cleanup = function () {
			// clean up handlers added by addEventListener
			domEvents.removeEventListener(parent, 'inserted', parentInsertedHandler);
			domEvents.removeEventListener(child, 'inserted', childInsertedHandler);

			// clean up handler added by onInsertion
			removeOnInsertionHandler ();

			// remove inserted event from registry
			delete domEvents._eventRegistry._registry.inserted;

			// test complete
			done();
		};

		var insertedEventCount = 0;
		parentInsertedHandler = function () {
			insertedEventCount++;
		};
		domEvents.addEventListener(parent, 'inserted', parentInsertedHandler);

		// listen to inserted event on child to ensure event happens
		childInsertedHandler = function () {};
		domEvents.addEventListener(child, 'inserted', childInsertedHandler);

		// listen for any element being inserted and run appropriate test
		var onNodeInsertionCount = 0;
		removeOnInsertionHandler  = domMutate.onInsertion(document.documentElement, function (mutation) {
			if(mutation.target === parent) {
				assert.equal(insertedEventCount, 1, 'inserted event should trigger for event.currentTarget');
				assert.equal(onNodeInsertionCount, 0, 'parent insertion called at right time');
				onNodeInsertionCount++;
				node.appendChild.call(parent, child);
			} else if(mutation.target === child) {
				assert.equal(insertedEventCount, 1, 'inserted event should NOT trigger for child of event.currentTarget');
				assert.equal(onNodeInsertionCount, 1, 'child insertion called at right time');
				onNodeInsertionCount++;
				setTimeout(cleanup, 50);
			} else {
				console.log("dom-events test: mutation fired for non-test element", mutation);
			}
		});

		node.appendChild.call(fixture, parent);
	});
});
