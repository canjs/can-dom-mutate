'use strict';

var domData = require('can-dom-data-state');
var CIDMap = require('can-cid/map/map');
var CIDSet = require('can-cid/set/set');

function getDataKey(eventType, defaultEventType) {
	return eventType + defaultEventType + 'Data';
}

function deleteTargetListeners (doc, docKey, docData, eventType, target, targetData) {
	if (targetData.removeListener) {
		targetData.removeListener();
		targetData.removeListener = null;
	}

	docData['delete'](target);

	if (docData.size === 0) {
		domData.clean.call(doc, docKey);
	}
}

function makeMutationEvent(defaultEventType, subscription, dispatch, options) {
	var dispatchOnce = options.dispatchOnce;
	var deleteDomData = options.deleteDomData;

	var event = {
		defaultEventType: defaultEventType,
		addEventListener: function (target, eventType, handler) {
			var dataKey = getDataKey(eventType, defaultEventType);
			var doc = target.ownerDocument;
			var documentData = domData.get.call(doc, dataKey);
			if (!documentData) {
				documentData = new CIDMap();
				domData.set.call(doc, dataKey, documentData);
			}

			var data = documentData.get(target);
			if (!data) {
				data = {
					removeListener: null,
					listeners: new CIDSet()
				};
				documentData.set(target, data);
			}

			var isDuplicateHandler = data.listeners.has(handler);
			if (isDuplicateHandler) {
				return;
			}

			if (data.listeners.size === 0) {
				var domEvents = this;
				var removeListener = subscription(target, function (mutation) {
					var didDispatch = dispatch(domEvents.dispatch, target, eventType, mutation);
					if (!didDispatch) {
						return;
					}

					if (dispatchOnce) {
						// NOTE: The event will only ever be fired once
						// This is for backwards-compatibility with can-util/dom/events
						data.listeners.forEach(function (handler) {
							target.removeEventListener(eventType, handler);
						});

						deleteTargetListeners(doc, dataKey, documentData, eventType, target, data);
					}

					if (deleteDomData) {
						// NOTE: The event will remove ALL dom data on the target
						// This is for backwards-compatibility with can-util/dom/events
						domData['delete'].call(target);
					}
				});
				data.removeListener = removeListener;
			}

			data.listeners.add(handler);
			target.addEventListener(eventType, handler);
		},
		removeEventListener: function (target, eventType, handler) {
			target.removeEventListener(eventType, handler);

			var dataKey = getDataKey(eventType, defaultEventType);
			var doc = target.ownerDocument;
			var documentData = domData.get.call(doc, dataKey);
			if (!documentData) {
				return;
			}

			var data = documentData.get(target);
			if (!data) {
				return;
			}

			data.listeners['delete'](handler);

			if (data.listeners.size === 0) {
				deleteTargetListeners(doc, dataKey, documentData, eventType, target, data);
			}
		}
	};

	return event;
}
module.exports = makeMutationEvent;
