
// 存储捕获到的请求头
let capturedRequests = [];

const EventTypes = {
  all_event: '全部事件',
  user_operation_event: '用户操作',
  page_load_event: '页面加载',
  invoke_workflow_event: '流程执行',
  invoke_dataflow_event: '数据流执行',
  access_control_event: '鉴权',
  invoke_openapi_event: 'Open Api 调用',
  page_error_event: '页面错误',
  invoke_function_event: '函数执行历史'
};

// 监听网络请求
// onBeforeRequest -> OnBeforeSendHeaders -> onSendHeaders -> onHeadersReceived -> onResponseStarted -> onCompleted
chrome.webRequest.onBeforeRequest.addListener((details) => {
  // 存储请求信息
  const url = details.url;
  if (!url) {
    return;
  }

  if (url.endsWith('/events/search') || url.endsWith('/logs/search')) {
    if (capturedRequests.length > 10) {
      capturedRequests.shift();
    }

    const requestBodyString = String.fromCharCode.apply(
      null,
      new Uint8Array(details.requestBody.raw[0].bytes)
    );
    const requestBody = JSON.parse(requestBodyString);

    if (requestBody.event_type !== "all_event") {
      capturedRequests.push({
        requestId: details.requestId,
        url: details.url,
        host: new URL(details.url).host,
        requestBody: requestBody,
        eventTypeStr: url.endsWith('/logs/search') ? '函数日志' : (EventTypes[requestBody.event_type] ? EventTypes[requestBody.event_type] : 'Unknown'),
        method: details.method,
        timestamp: details.timeStamp,
        namespace: parseAppNamespace(details.url)
      })
    }
  }

  return { requests: capturedRequests };
},
  { urls: ["<all_urls>"] },  // 匹配所有URL，可以改为特定域名
  ["extraHeaders", 'requestBody']
);

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  // 存储请求信息
  const url = details.url;
  if (!url) {
    return;
  }

  if (url.endsWith('/events/search') || url.endsWith('/logs/search')) {
    if (capturedRequests.length > 10) {
      capturedRequests.shift();
    }
    const request = capturedRequests.find(x => x.requestId === details.requestId);
    const headers = {};
    for (const h of details.requestHeaders) {
      headers[h.name] = h.value;
    }
    if (request) {
      request.headers = headers;
    }
  }

  // for (const h of details.requestHeaders) {
  //   if (h.name === 'x-kunlun-token' && h.value) {
  //     x_kunlun_token = h.value
  //   }
  // }

  return { requests: capturedRequests };
},
  { urls: ["<all_urls>"] },  // 匹配所有URL，可以改为特定域名
  ["extraHeaders", 'requestHeaders']
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCookie') {
    getCookie(request.domain).then(sendResponse);
    return true;
  }
  else if (request.action === 'getRequests') {
    sendResponse(capturedRequests);
    return true;
  }
  else if (request.action === 'downloadEvents') {
    // 获取指定域名的所有请求
    downloadEvents(request.data.url, request.data.method, request.data.headers, request.data.requestBody, request.next_cursor).then(sendResponse);
    return true;
  }
});

chrome.action.onClicked.addListener(async () => {
  // chrome.tabs.create({ url: "popup.html" });
  const url = chrome.runtime.getURL("popup.html")
  const tabs = await chrome.tabs.query({ url: url });

  if (tabs.length > 0) {
    // 如果目标页面已打开，激活该标签页
    chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    // 如果目标页面未打开，打开新标签页
    chrome.tabs.create({ url: url });
  }
});

async function getCookie(domain) {
  try {
    const cookies = await chrome.cookies.getAll({
      domain: domain // 使用传入的域名
    });
    return cookies;
  } catch (error) {
    console.error('获取 cookie 失败:', error);
    throw error;
  }
}

async function downloadEvents(url, method, headers, body, next_cursor) {
  // console.log({ url, method, headers, body, next_cursor });
  try {
    if (next_cursor) {
      body.next_cursor = next_cursor;
    }

    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(body)
    });

    return await response.json();
  } catch (error) {
    console.error('访问 API 失败:', error);
    throw error;
  }
}

/**
 * 
 * @param {string} url 
 * @returns {string | undefined}
 */
function parseAppNamespace(url) {
  // console.log(url)
  // https://apaas-dev15229.aedev.feishuapp.cn/ae/lowcode/ns/package_7a2002__c/obser_api_call?lane_id=develop
  // https://apaas.feishu.cn/ae/app_manage/package_7a2002__c/observable/evt/obser_all_evt
  // https://apaas.feishuapp.cn/ae/lowcode/ns/package_7a2002__c/obser_all_evt?lane_id=master
  if (!url) {
    return;
  }

  const regex = /\/ae\/api\/v1\/namespaces\/(?<app>.+?)\/(?:events|logs)\/search/gm;
  let m = regex.exec(url);
  if (m && m.groups && m.groups['app']) {
    return m.groups['app'];
  }
}