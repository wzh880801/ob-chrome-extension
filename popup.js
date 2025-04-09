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
        //   await writable.write(`开始时间\t结束时间\t事件ID\t事件类型\t事件详情\n`)
        // }

        if (request.requestBody.event_type === 'user_operation_event') {
          await writable.write(`操作时间(GTM+08:00)\t操作类型\t页面名称\t终端\t组件ID\t操作人\t页面 API 名称\tBuilder 版本\t详情\n`)
        }
        else if (request.requestBody.event_type === 'page_load_event') {
          await writable.write(`操作时间(GTM+08:00)\t页面名称\t上级页面名称\t上级页面 API 名称\t终端\t加载耗时\t操作人\t详情\n`)
        }
        else if (request.requestBody.event_type === 'invoke_workflow_event') {
          await writable.write(`操作时间(GTM+08:00)\t流程名称\tAPI 名称\t触发方式\t状态\t响应码\t耗时\t消耗额度\t发起人\t执行 ID\t响应描述\t详情\n`)
        }
        else if (request.requestBody.event_type === 'invoke_function_event') {
          await writable.write(`操作时间(GTM+08:00)\t函数名称\tAPI 名称\t长函数\t语言(1-NodeJS 2-GO 4-JAVA)\t耗时\t触发方式\t状态(1-执行完成 2-执行失败 3-终止执行 4-处理中)\t操作人\t详情\n`)
        }
        else if (request.requestBody.event_type === 'invoke_dataflow_event') {
          // await writable.write(`操作时间(GTM+08:00)\t数据流名称\tAPI 名称\t触发方式\t状态\t耗时\t发起人\t详情\n`)
            await writable.write(`开始时间\t结束时间\t事件ID\t事件类型\t事件详情\n`)
        }
        else if (request.requestBody.event_type === 'access_control_event') {
          await writable.write(`操作时间(GTM+08:00)\t鉴权资源\t鉴权结果\t鉴权详情\t详情\n`)
        }
        else if (request.requestBody.event_type === 'page_error_event') {
          await writable.write(`操作时间(GTM+08:00)\页面名称\t终端\t错误码\t错误信息\t页面 API 名称\t详情\n`)
        }
        else if (request.requestBody.event_type === 'invoke_openapi_event') {
          await writable.write(`操作时间(GTM+08:00)\tOpenAPI 版本\tClient ID\t调用方法\tURI\t响应码\t耗时\t详情\n`)
        }
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
              // await writable.write(`${e.start_timestamp}\t${e.end_timestamp ? e.end_timestamp : ''}\t${e.event_id}\t${e.event_type}\t${JSON.stringify({ ...e, event_detail: JSON.parse(e.event_detail) })}\n`);

              const _e = JSON.parse(e.event_detail);
              const start_time = new Date(e.start_timestamp + 8 * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '');
              const e_json_str = JSON.stringify({ ...e, event_detail: JSON.parse(e.event_detail) });

              if (request.requestBody.event_type === 'user_operation_event') {
                // await writable.write(`操作时间(GTM+08:00)\t操作类型\t页面名称\t终端\t组件ID\t操作人\t页面 API 名称\tBuilder 版本\t详情\n`)
                const user = response.data.context.users[_e.operator_uid];
                await writable.write(`${start_time}\t${_e.operation_type}\t${_e.page_name}\t${_e.page_type}\t${_e.element_id}\t${user ? user.name : _e.operator_uid}\t${_e.page_api_name}\t${_e.page_version}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'page_load_event') {
                // await writable.write(`操作时间(GTM+08:00)\t页面名称\t上级页面名称\t上级页面 API 名称\t终端\t加载耗时\t操作人\t详情\n`)
                const user = response.data.context.users[_e.operator_uid];
                await writable.write(`${start_time}\t${_e.page_name}\t${_e.parent_page_name ? _e.parent_page_name : '--'}\t${_e.parent_page_api_name ? _e.parent_page_api_name : '--'}\t${_e.page_type}\t${_e.cost ? _e.cost : '--'}\t${user ? user.name : _e.operator_uid}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'invoke_workflow_event') {
                // await writable.write(`操作时间(GTM+08:00)\t流程名称\tAPI 名称\t触发方式\t状态\t响应码\t耗时\t消耗额度\t发起人\t执行 ID\t响应描述\t详情\n`)
                const workflow_name = _e.workflow_name.find(x => x.language_code === 2052).text;
                const error_msg = _e.error_msg.find(x => x.language_code === 2052).text;
                const user = response.data.context.users[_e.invoker_uid];
                await writable.write(`${start_time}\t${workflow_name}\t${_e.workflow_api_name}\t${_e.trigger_type}\t${_e.state}\t${_e.error_code}\t${_e.cost ? _e.cost : '--'}\t${'--'}\t${user ? user.name : _e.invoker_uid}\t${_e.invoke_id}\t${error_msg}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'invoke_function_event') {
                // await writable.write(`操作时间(GTM+08:00)\t函数名称\tAPI 名称\t长函数\t语言\t耗时\t触发方式\t状态\t操作人\t详情\n`)
                const function_name = _e.function_name.find(x => x.language_code === 2052).text;
                const user = response.data.context.users[_e.operator_uid];
                await writable.write(`${start_time}\t${function_name}\t${_e.function_api_name}\t${_e.is_long}\t${_e.code_language}\t${_e.cost}\t${_e.invoke_origin_type}\t${_e.state}\t${user ? user.name : _e.operator_uid}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'invoke_dataflow_event') {
                // await writable.write(`操作时间(GTM+08:00)\t数据流名称\tAPI 名称\t触发方式\t状态\t耗时\t发起人\t详情\n`)
                await writable.write(`${e.start_timestamp}\t${e.end_timestamp ? e.end_timestamp : ''}\t${e.event_id}\t${e.event_type}\t${e_json_str}\n`);
              }
              else if (request.requestBody.event_type === 'access_control_event') {
                // await writable.write(`操作时间(GTM+08:00)\t鉴权资源\t鉴权结果\t鉴权详情\t详情\n`)
                const resource_name = _e.resource.find(x => x.language_code === 2052).text;
                const detail = _e.detail && _e.detail.length > 0 ? _e.detail.find(x => x.language_code === 2052).text.replace(/\n/g, ';') : '-'
                await writable.write(`${start_time}\t${resource_name}\t${_e.has_auth ? '有权限' : '无权限'}\t${detail}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'page_error_event') {
                // await writable.write(`操作时间(GTM+08:00)\页面名称\t终端\t错误码\t错误信息\t页面 API 名称\t详情\n`)
                await writable.write(`${start_time}\t${_e.page_name}\t${_e.page_type}\t${_e.error_code}\t${_e.error_msg ? _e.error_msg.replace(/\n/g, ';') : ''}\t${_e.page_api_name}\t${e_json_str}\n`)
              }
              else if (request.requestBody.event_type === 'invoke_openapi_event') {
                // await writable.write(`操作时间(GTM+08:00)\tOpenAPI 版本\tClient ID\t调用方法\tURI\t响应码\t耗时\t详情\n`)
                await writable.write(`${start_time}\t${_e.openapi_version}\t${_e.client_id}\t${_e.method}\t${_e.uri}\t${_e.response_code}\t${_e.request_cost}\t${e_json_str}\n`)
              }
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
          console.error(`[${new Date().toLocaleTimeString()}] [error] ${_err.message}`);
          break;
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