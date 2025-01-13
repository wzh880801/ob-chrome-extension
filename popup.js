// 获取当前域名的函数
async function getCurrentDomain() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tabs[0].url);
  return url.hostname;
}

// 添加显示请求列表的函数
async function displayRequests() {
  const requests = await chrome.runtime.sendMessage({
    action: 'getRequests'
  });

  // 获取当前显示的记录ID
  let existingIds = [];
  const results = document.getElementsByClassName('search-history-item');
  for (const item of results) {
    existingIds.push(item.dataset.id);
  }

  // 检查是否有新记录
  const hasNewRequests = requests.some(request =>
    !existingIds.includes(request.requestId)
  );

  // 只有在有新记录时才刷新页面
  if (!hasNewRequests) {
    return;
  }

  // 有新记录，重新渲染整个列表
  const resultDiv = document.getElementById('result');
  resultDiv.innerHTML = '';

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];

    const card = document.createElement('div');
    card.className = 'search-history-item';
    card.classList.add(i % 2 === 0 ? 'item-white' : 'item-gray');
    card.dataset.id = request.requestId;
    // card.innerText = `${request.eventTypeStr} (${new Date(request.timestamp).toLocaleTimeString()})`;

    const info = `[${request.host}] [${request.namespace}] ${request.eventTypeStr} (${new Date(request.timestamp).toLocaleTimeString()})`;

    const infoDiv = document.createElement('div');
    infoDiv.innerText = info;

    const content = document.createElement('div');
    content.className = 'content';
    content.insertBefore(infoDiv, null);

    const btn = document.createElement('div');
    btn.className = 'download-btn';

    btn.onclick = async () => {

      clearInterval(interval);

      // 打开文件保存对话框，让用户选择文件保存位置和名称
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: `downloaded_${Date.now()}.txt`,
        types: [
          {
            description: 'Text Files',
            accept: {
              'text/plain': ['.txt'] // 限制文件扩展名为 .txt
            }
          }
        ]
      });

      if (!fileHandle) {
        return;
      }

      btn.remove();

      card.classList.add('loading-wave');
      infoDiv.innerHTML = `[下载中...] ${info}`;

      const infoP = document.createElement('p');
      content.insertBefore(infoP, null);

      // 获取文件句柄
      let writable = await fileHandle.createWritable();
      const isFunctionLog = request.eventTypeStr === '函数日志';
      if (isFunctionLog) { 
        await writable.write(`日志时间\t事件ID\t日志ID\t类型\t日志详情\n`)
      }
      else {
        await writable.write(`开始时间\t结束时间\t事件ID\t事件类型\t事件详情\n`)
      }

      let next_cursor = '';

      let i = 0;
      let dataCount = 0;

      while (true) {
        try {
          infoP.innerText = `[${new Date().toLocaleTimeString()}] 正在获取第 ${++i} 页数据，请耐心等待...`;
          const response = await chrome.runtime.sendMessage({
            action: 'downloadEvents',
            data: request,
            next_cursor: next_cursor
          });

          if (response && response.status_code === '0') {
            infoP.innerText = `[${new Date().toLocaleTimeString()}] 第 ${i} 页获取成功: ${isFunctionLog ? response.data.logs.length : response.data.events.length} 条数据。`;
            dataCount += (isFunctionLog ? response.data.logs.length : response.data.events.length);
          }
          else {
            infoP.innerText = `[${new Date().toLocaleTimeString()}] [error] ${response.status_code} ${response.error_msg}`;
            break;
          }

          if (isFunctionLog) {
            for (const e of response.data.logs) {
              await writable.write(`${e.timestamp}\t${e.event_id}\t${e.id}\t${e.level}\t${JSON.stringify(e)}\n`)
            }
          }
          else {
            for (const e of response.data.events) {
              await writable.write(`${e.start_timestamp}\t${e.end_timestamp ? e.end_timestamp : ''}\t${e.event_id}\t${e.event_type}\t${JSON.stringify({ ...e, event_detail: JSON.parse(e.event_detail) })}\n`)
            }
          }

          if (!response.data.has_more) {
            break;
          }

          const wait = Math.random() * 1000 + 1000;
          await sleep(wait);

          next_cursor = response.data.next_cursor;
        }
        catch (_err) {
          infoP.innerText = `[${new Date().toLocaleTimeString()}] [error] ${_err.message}`;
        }
      }

      // 关闭文件
      await writable.close();

      infoDiv.innerText = `[下载完成(${dataCount} 条数据)] ${info}`;
      card.classList.remove('loading-wave');
      card.classList.add('download-success');
      infoP.remove();
    }

    card.insertBefore(btn, card.firstChild);
    card.insertBefore(content, card.firstChild);

    resultDiv.insertBefore(card, resultDiv.firstChild);
  }
}

/**
 * 
 * @param {number} ms 
 * @returns 
 */
async function sleep(ms) {
  return new Promise((resole) => setTimeout(resole, ms));
}

const interval = setInterval(async () => {
  displayRequests()
}, 1000);