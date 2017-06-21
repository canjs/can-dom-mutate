var getRoot = require('can-util/js/global/global');
var currentMutationObserver;
var mutationObserverChangeListeners = [];
var domMutateObserver = {
  initial: function () {
    return getRoot().MutationObserver;
  },
  get: function () {
    return currentMutationObserver;
  },
  set: function (observer) {
    currentMutationObserver = observer;
    mutationObserverChangeListeners.forEach(function (listener) {
      listener(currentMutationObserver);
    });
  },
  onChange: function (listener) {
    mutationObserverChangeListeners.push(listener);
    return function offChange() {
      mutationObserverChangeListeners = mutationObserverChangeListeners.filter(function (l) {
        return l !== listener;
      });
    };
  }
};
domMutateObserver.set(domMutateObserver.initial());
module.exports = domMutateObserver;
