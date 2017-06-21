'use strict';
var domData = require('can-util/dom/data/data');
var CIDMap = require('can-util/js/cid-map/cid-map');
function getDataKey(eventType, defaultEventType) {
  return eventType + defaultEventType + 'Data';
}
function makeMutationEvent(defaultEventType, subscription, dispatch, dispatchOnce) {
  var event = {
    defaultEventType: defaultEventType,
    addEventListener: function (target, eventType, handler) {
      var dataKey = getDataKey(eventType, defaultEventType);
      var data = domData.get.call(target, dataKey) || new CIDMap();
      var hasSubscription = !!data.get(handler);
      if (hasSubscription) {
        return;
      }
      var domEvents = this;
      var removeListener = subscription(target, function (mutation) {
        dispatch(domEvents.dispatch, target, eventType, mutation);
        if (dispatchOnce) {
          // NOTE: The event will only ever be fired once
          // This is for backwards-compatibility with can-util/dom/events
          event.removeEventListener(target, eventType, handler);
        }
      });
      data.set(handler, removeListener);
      domData.set.call(target, dataKey, data);
      target.addEventListener(eventType, handler);
    },
    removeEventListener: function (target, eventType, handler) {
      var dataKey = getDataKey(eventType, defaultEventType);
      var data = domData.get.call(target, dataKey);
      if (!data) {
        return;
      }
      var removeSubscription = data.get(handler);
      if (!removeSubscription) {
        return;
      }
      removeSubscription();
      data['delete'](handler);
      if (data.size === 0) {
        domData.clean.call(target, dataKey);
      }
      target.removeEventListener(eventType, handler);
    }
  };
  return event;
}
module.exports = makeMutationEvent;