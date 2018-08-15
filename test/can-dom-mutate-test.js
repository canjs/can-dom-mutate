var unit = require('steal-qunit');
var domMutate = require('../can-dom-mutate');
var getDocument = require('can-globals/document/document');
var node = require('../node');
var testUtils = require('./test-utils');
var globals = require('can-globals');

var test = unit.test;
var moduleMutationObserver = testUtils.moduleMutationObserver;

moduleMutationObserver('can-dom-mutate', function () {
	test('onNodeInsertion should be called when that node is inserted', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onNodeInsertion(child, function (mutation) {
			var node = mutation.target;
			assert.equal(node, child, 'Node should be the inserted child');

			undo();
			done();
		});

		node.appendChild.call(parent, child);
	});

	test('onNodeRemoval should be called when that node is removed', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onNodeRemoval(child, function (mutation) {
			var node = mutation.target;
			assert.equal(node, child, 'Node should be the removed child');

			undo();
			done();
		});

		parent.appendChild(child);
		node.removeChild.call(parent, child);
	});

	test('onNodeAttributeChange should be called when that node\'s attributes change', function (assert) {
		var done = assert.async();
		var child = document.createElement('div');
		var attributeName = 'foo';
		child.setAttribute(attributeName, 'bar');

		var undo = domMutate.onNodeAttributeChange(child, function (mutation) {
			assert.equal(mutation.target, child, 'Node should be the removed child');
			assert.equal(mutation.attributeName, attributeName);
			assert.equal(mutation.oldValue, 'bar');

			undo();
			done();
		});

		node.setAttribute.call(child, attributeName, 'baz');
	});

	test('onInserted should be called when any node is inserted', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onInsertion(document.documentElement, function (mutation) {
			assert.equal(mutation.target, child, 'Node should be the inserted child');

			undo();
			done();
		});

		node.appendChild.call(parent, child);
	});

	test('onInserted should be called with inserted fragment subtree', function (assert) {
		assert.expect(3);
		var done = assert.async();
		var parent = testUtils.getFixture();
		var fragment = new DocumentFragment();
		var child1 = document.createElement('div');
		child1.id = 'child1';
		var child2 = document.createElement('div');
		child2.id = 'child2';
		var grandchild = document.createElement('div');
		grandchild.id = 'grandchild';
		fragment.appendChild(child1);
		fragment.appendChild(child2);
		child2.appendChild(grandchild);

		var dispatchCount = 0;
		var nodes = [child1, child2, grandchild];
		var undo = domMutate.onInsertion(document.documentElement, function (mutation) {
			var target = mutation.target;
			if (nodes.indexOf(target) !== -1) {
				dispatchCount++;
				if (target === child1) {
					assert.ok(true, 'child1 dispatched');
				}
				if (target === child2) {
					assert.ok(true, 'child2 dispatched');
				}
				if (target === grandchild) {
					assert.ok(true, 'grandchild dispatched');
				}
				if (dispatchCount >= nodes.length) {
					undo();
					done();
				}
			}
		});

		node.appendChild.call(parent, fragment);
	});

	test('onRemoval should be called when any node is removed', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = domMutate.onRemoval(document.documentElement, function (mutation) {
			assert.equal(mutation.target, child, 'Node should be the removed child');

			undo();
			done();
		});

		parent.appendChild(child);
		node.removeChild.call(parent, child);
	});

	test('onNodeInsertion should be called when that node is inserted into a different document', function(assert){
		var done = assert.async();
		var parent = testUtils.getFixture();

		var doc1 = document.implementation.createHTMLDocument('doc1');
		var child = doc1.createElement('div');

		var undo = domMutate.onNodeInsertion(child, function (mutation) {
			var node = mutation.target;
			assert.equal(node, child, 'Node should be the inserted child');

			undo();
			done();
		});

		node.appendChild.call(parent, child);
	});

	test('onNodeRemoval does not leak when given a document fragment', function(assert){
		var doc1 = document.implementation.createHTMLDocument('doc1');
		var frag = doc1.createDocumentFragment();
		frag.appendChild(doc1.createElement('div'));

		// Figure out how many things are listening for MO changes.
		var getListenerCount = function() { return globals.eventHandlers.MutationObserver.length; };
		var previousListenerCount = getListenerCount();

		getDocument(doc1);
		domMutate.onNodeRemoval(frag, function() {});
		getDocument(document);

		assert.equal(getListenerCount(), previousListenerCount, "No new listeners added for this fragment");
	});
});
