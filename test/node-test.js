var unit = require('steal-qunit');
var domMutate = require('../can-dom-mutate');
var getDocument = require('can-globals/document/document');
var node = require('../node');
var testUtils = require('./test-utils');

var test = unit.test;
var moduleWithMutationObserver = testUtils.moduleWithMutationObserver;
var moduleWithoutMutationObserver = testUtils.moduleWithoutMutationObserver;
var mock = testUtils.mock;

function neverCall(assert, obj, methodName) {
	return mock(obj, methodName, function () {
		assert.ok(false, methodName + ' should not be called');
	});
}

moduleWithMutationObserver('can-dom-mutate/node', function () {
	test('appendChild should not call domMutate.dispatchNodeInsertion', function (assert) {
		var parent = testUtils.getFixture();
		var child = document.createElement('div');
		var undo = neverCall(assert, domMutate, 'dispatchNodeInsertion');

		node.appendChild.call(parent, child);
		undo();

		assert.ok(parent.contains(child), 'child should be in parent');
	});

	test('insertBefore should not call domMutate.dispatchNodeInsertion', function (assert) {
		var parent = testUtils.getFixture();
		var sibling = document.createElement('span');
		var child = document.createElement('div');
		var undo = neverCall(assert, domMutate, 'dispatchNodeInsertion');

		parent.appendChild(sibling);
		node.insertBefore.call(parent, child, sibling);
		undo();

		assert.ok(parent.contains(child), 'child should be in parent');
	});

	test('removeChild should not call domMutate.dispatchNodeRemoval', function (assert) {
		var parent = testUtils.getFixture();
		var child = document.createElement('div');
		var undo = neverCall(assert, domMutate, 'dispatchNodeRemoval');

		parent.appendChild(child);
		node.removeChild.call(parent, child);
		undo();

		assert.ok(!parent.contains(child), 'child should not be in parent');
	});

	test('replaceChild should not call domMutate.dispatchNodeRemoval+Insertion', function (assert) {
		var parent = testUtils.getFixture();
		var sibling = document.createElement('span');
		var child = document.createElement('div');
		var undoRemoval = neverCall(assert, domMutate, 'dispatchNodeRemoval');
		var undoInsertion = neverCall(assert, domMutate, 'dispatchNodeInsertion');

		parent.appendChild(sibling);
		node.replaceChild.call(parent, child, sibling);
		undoRemoval();
		undoInsertion();

		assert.ok(!parent.contains(sibling), 'sibling should not be in parent');
		assert.ok(parent.contains(child), 'child should be in parent');
	});

	test('setAttribute should not call domMutate.dispatchNodeAttributeChange', function (assert) {
		var element = document.createElement('div');
		var undo = neverCall(assert, domMutate, 'dispatchNodeAttributeChange');

		node.setAttribute.call(element, 'data-foo', 'bar');
		undo();

		assert.equal(element.getAttribute('data-foo'), 'bar', 'Attribute should be set');
	});

	test('removeAttribute should not call domMutate.dispatchNodeAttributeChange', function (assert) {
		var element = document.createElement('div');
		var undo = neverCall(assert, domMutate, 'dispatchNodeAttributeChange');

		node.removeAttribute.call(element, 'data-foo');
		node.setAttribute.call(element, 'data-foo', 'bar');
		node.removeAttribute.call(element, 'data-foo');
		undo();

		assert.equal(element.getAttribute('data-foo'), null, 'Attribute should not be set');
	});
});

moduleWithoutMutationObserver('can-dom-mutate/node', function () {
	test('appendChild should call domMutate.dispatchNodeInsertion', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = mock(domMutate, 'dispatchNodeInsertion', function (node, callback) {
			assert.equal(node, child, 'Should pass the child being appended');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.ok(parent.contains(node), 'Node should be in parent before dispatch is called');
			undo();
			done();
		});

		node.appendChild.call(parent, child);
	});

	function getFragmentInsertionTest () {
		var fragment = new DocumentFragment();
		var child1 = document.createElement('div');
		var child2 = document.createElement('div');
		var grandchild = document.createElement('div');
		fragment.appendChild(child1);
		fragment.appendChild(child2);
		child2.appendChild(grandchild);

		return {
			fragment: fragment,
			check: function (assert) {
				var nodes = [child1, child2];
				var dispatches = 0;
				var undoInsertion = mock(domMutate, 'dispatchNodeInsertion', function (node) {
					dispatches++;
					assert.ok(nodes.indexOf(node) !== -1, 'child node added');
					if (dispatches >= nodes.length) {
						undoInsertion();
					}
				});
			}
		};
	}

	test('appendChild should dispatch fragment children to dispatchNodeInserted', function (assert) {
		assert.expect(2);
		var parent = testUtils.getFixture();
		var fragTest = getFragmentInsertionTest();
		fragTest.check(assert);
		node.appendChild.call(parent, fragTest.fragment);
	});

	test('insertBefore should call domMutate.dispatchNodeInsertion', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var sibling = document.createElement('span');
		var child = document.createElement('div');

		var undo = mock(domMutate, 'dispatchNodeInsertion', function (node, callback) {
			assert.equal(node, child, 'Should pass the child being appended');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.ok(parent.contains(node), 'Node should be in parent before dispatch is called');
			undo();
			done();
		});

		parent.appendChild(sibling);
		node.insertBefore.call(parent, child, sibling);
	});

	test('insertBefore should dispatch fragment children to dispatchNodeInserted', function (assert) {
		assert.expect(2);
		var parent = testUtils.getFixture();
		var sibling = document.createElement('div');
		parent.appendChild(sibling);

		var fragTest = getFragmentInsertionTest();
		fragTest.check(assert);
		node.insertBefore.call(parent, fragTest.fragment, sibling);
	});

	test('removeChild should call domMutate.dispatchNodeRemoval', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var child = document.createElement('div');

		var undo = mock(domMutate, 'dispatchNodeRemoval', function (node, callback) {
			assert.equal(node, child, 'Should pass the child being removed');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.ok(!parent.contains(node), 'Node should be removed before dispatch is called');
			undo();
			done();
		});

		parent.appendChild(child);
		node.removeChild.call(parent, child);
	});

	test('replaceChild should call domMutate.dispatchNodeRemoval+Insertion', function (assert) {
		var done = assert.async();
		var parent = testUtils.getFixture();
		var sibling = document.createElement('span');
		var child = document.createElement('div');
		var isSiblingRemoved = false;

		var undoRemoval = mock(domMutate, 'dispatchNodeRemoval', function (node, callback) {
			assert.equal(node, sibling, 'Should pass the sibling being removed');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.ok(!parent.contains(node), 'Node should be removed before dispatch is called');
			undoRemoval();
			isSiblingRemoved = true;
		});

		var undoInsertion = mock(domMutate, 'dispatchNodeInsertion', function (node, callback) {
			assert.ok(isSiblingRemoved, 'Sibling should be removed before the child is inserted (as far as dispatch order is concerned)');
			assert.equal(node, child, 'Should pass the child being inserted');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.ok(parent.contains(node), 'Node should be inserted before dispatch is called');
			undoInsertion();
			done();
		});

		parent.appendChild(sibling);
		node.replaceChild.call(parent, child, sibling);
	});

	test('replaceChild should dispatch fragment children to dispatchNodeInserted', function (assert) {
		assert.expect(3);
		var parent = testUtils.getFixture();
		var sibling = document.createElement('div');
		parent.appendChild(sibling);

		var fragTest = getFragmentInsertionTest();
		fragTest.check(assert);

		var undoRemoval = mock(domMutate, 'dispatchNodeRemoval', function (node) {
			assert.equal(node, sibling, 'sibling should be removed');
			undoRemoval();
		});

		node.replaceChild.call(parent, fragTest.fragment, sibling);
	});

	test('setAttribute should call domMutate.dispatchNodeAttributeChange', function (assert) {
		var done = assert.async();
		var element = document.createElement('div');
		element.setAttribute('data-foo', 'bar');

		var undo = mock(domMutate, 'dispatchNodeAttributeChange', function (node, attributeName, oldAttributeValue, callback) {
			assert.equal(node, element, 'Should pass the element whose attribute is changing');
			assert.equal(attributeName, 'data-foo', 'Should pass the changed attribute name');
			assert.equal(oldAttributeValue, 'bar', 'Should pass the old attribute value');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.equal(element.getAttribute('data-foo'), 'baz', 'Node should have the new attribute value');
			undo();
			done();
		});

		node.setAttribute.call(element, 'data-foo', 'baz');
	});

	test('removeAttribute should call domMutate.dispatchNodeAttributeChange', function (assert) {
		var done = assert.async();
		var element = document.createElement('div');
		element.setAttribute('data-foo', 'bar');

		var undo = mock(domMutate, 'dispatchNodeAttributeChange', function (node, attributeName, oldAttributeValue, callback) {
			assert.equal(node, element, 'Should pass the element whose attribute is changing');
			assert.equal(attributeName, 'data-foo', 'Should pass the changed attribute name');
			assert.equal(oldAttributeValue, 'bar', 'Should pass the old attribute value');
			assert.equal(callback, undefined, 'Should not pass a callback');
			assert.equal(element.getAttribute('data-foo'), null, 'Node attribute value should have been removed');
			undo();
			done();
		});

		node.removeAttribute.call(element, 'data-foo');
	});
});

moduleWithoutMutationObserver('can-dom-mutate/node (not in document)', function () {
	/*
		We do not want insertion events to dispatched when a node
		is inserted into a parent which is not in the document.
		For example, inserting a node into a document fragment
		should not trigger an insertion event.

		The same applied to removal events. Removal events should
		only fire when the node is removed from the document.

		Attribute changes can fire at any time as that is observed
		at the node level, not the document.
	*/

	test('appendChild should not call dispatchNodeInsertion', function (assert) {
		assert.expect(0);
		var fragment = new DocumentFragment();
		var child = document.createElement('div');
		var undo = mock(domMutate, 'dispatchNodeInsertion', function () {
			assert.ok(false, 'This should never be called');
		});

		node.appendChild.call(fragment, child);
		undo();
	});

	test('insertBefore should not call dispatchNodeInsertion', function (assert) {
		assert.expect(0);
		var fragment = new DocumentFragment();
		var child = document.createElement('div');
		var reference = document.createElement('span');
		fragment.appendChild(reference);

		var undo = mock(domMutate, 'dispatchNodeInsertion', function () {
			assert.ok(false, 'This should never be called');
		});

		node.insertBefore.call(fragment, child, reference);
		undo();
	});

	test('removeChild should not call dispatchNodeRemoval', function (assert) {
		assert.expect(0);
		var fragment = new DocumentFragment();
		var child = document.createElement('div');
		fragment.appendChild(child);

		var undo = mock(domMutate, 'dispatchNodeRemoval', function () {
			assert.ok(false, 'This should never be called');
		});

		node.removeChild.call(fragment, child);
		undo();
	});

	test('replaceChild should not call dispatchNodeRemoval+Insertion', function (assert) {
		assert.expect(0);
		var fragment = new DocumentFragment();
		var child = document.createElement('div');
		var oldChild = document.createElement('span');
		fragment.appendChild(oldChild);

		var undoRemoval = mock(domMutate, 'dispatchNodeRemoval', function () {
			assert.ok(false, 'This should never be called');
		});
		var undoInsertion = mock(domMutate, 'dispatchNodeInsertion', function () {
			assert.ok(false, 'This should never be called');
		});

		node.replaceChild.call(fragment, child, oldChild);
		undoRemoval();
		undoInsertion();
	});

	test('removeChild on the documentElement', function(assert) {
		var done = assert.async();
		var doc1 = document.implementation.createHTMLDocument('doc1');

		var undo = domMutate.onNodeRemoval(doc1.documentElement, function() {
			assert.ok(true, 'this was called');
			undo();
			done();
		});

		getDocument(doc1);
		node.removeChild.call(doc1, doc1.documentElement);
		getDocument(document);
	});
});
