// Bind the essential action before optional editor and animation setup.
(function () {
  var button = document.querySelector('#publish');
  var label = document.querySelector('#publish-label');
  var layer = document.querySelector('#publish-dialog');
  var error = document.querySelector('#publish-error');
  var handler = null, pending = false;
  if (!button || !layer) return;
  function stage(name, text) {
    button.setAttribute('data-publish-stage', name);
    if (label) label.textContent = text;
  }
  button.addEventListener('click', function () {
    if (pending) return;
    layer.hidden = false;
    document.body.classList.add('modal-open');
    error.textContent = '';
    if (!handler) {
      stage('unavailable', '生成live图并发布');
      error.textContent = '发布组件未加载，请重新打开小工具';
      var retry = document.querySelector('#publish-export');
      if (retry) retry.disabled = true;
      return;
    }
    pending = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    stage('starting', '正在生成live图');
    Promise.resolve().then(handler).catch(function (reason) {
      console.error('发布入口', reason);
      error.textContent = '发布未能启动，请重新打开小工具';
      stage('failed', '生成live图并发布');
    }).then(function () {
      pending = false;
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      if (label) label.textContent = '生成live图并发布';
    });
  });
  // This close action remains available even if editor initialization fails.
  var close = layer.querySelector('.close-dialog');
  if (close) close.addEventListener('click', function () {
    if (pending) return;
    layer.hidden = true;
    document.body.classList.remove('modal-open');
  });
  window.ShamPublishEntry = {
    connect: function (callback) { handler = callback; },
    stage: stage
  };
}());
