
let chatInterval = null
let currentRequestsView = null;  

// Заголовок с CSRF-токеном для всех POST-запросов
function csrfHeaders(extra = {}) {
    const token = document.querySelector('meta[name="csrf-token"]').content;
    return { ...extra, 'X-CSRF-Token': token };
}

// Статус выводится только через textContent, без вставки в HTML
function fillStatus(card, status) {
    card.querySelector('.dropbtn').className = `dropbtn status-${status.toLowerCase()}`;
    card.querySelector('.status-badge').textContent = status;
}

// Кнопки пользователей в правой панели админа
document.querySelectorAll('.pc-item').forEach((btn) => {
    btn.addEventListener('click', () => {
        loadRequests(btn.dataset.userId, btn.dataset.userName, btn.dataset.adminId);
    });
});


window.addEventListener('beforeunload', () => {
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
});


function loadRequests(userId, userName, currentId) {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList = document.getElementById("requests-list");

    requestsTitle.innerText = `Заявки пользователя: ${userName}`;
    currentRequestsView = () => loadRequests(userId, userName, currentId);

    fetch(`/api/requests/${userId}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Ошибка при загрузке данных с сервера");
            }

            return response.json();
        })
        .then((requests) => {
            requestsList.innerHTML = "";

            if (requests.length === 0) {
                requestsList.innerHTML =
                    '<p style="color: gray;">У этого пользователя нет активных заявок.</p>';
                return;
            }

            requests.forEach((req) => {
                // Пользователь и так указан в заголовке, поэтому строку с именем не показываем
                requestsList.appendChild(createAdminRequestCard(req, currentId, false));
            });
        })
        .catch((error) => {
            console.error("Ошибка fetch:", error);
            requestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
}

function loadDate(dateDB){
    if(dateDB == null){
        return "------"
    }
    var isoStr = dateDB.replace(" ", "T") + "Z";
    var date = new Date(isoStr)  
    return date.toLocaleString('ru-RU')
}

// Карточка заявки для админа: одна функция для «Заявок пользователя» и «Истории заявок».
// showUser — показывать ли строку с именем автора заявки.
function createAdminRequestCard(req, currentId, showUser) {
    const reqCard = document.createElement('div');
    reqCard.className = 'request';
    reqCard.dataset.status = req.status;   // для цветной полоски в CSS

    // В разметке только пустые элементы, данные вставляются через textContent
    reqCard.innerHTML = `
        <p class="request-user"><b>Пользователь:</b> <span class="safe-user"></span></p>
        <h4>#${req.id}: <span class="safe-title"></span></h4>
        <p class="code">Код ошибки: <span class="safe-category"></span></p>
        <p class="code">Дата создания: <span class="safe-start-date"></span></p>
        <p class="code">Дата закрытия: <span class="safe-close-date"></span></p>
        <p>Текст: <span class="safe-text"></span></p>
        <div class="dropdown">
            <button class="dropbtn">
                Статус: <span class="status-badge"></span>
            </button>
            <i class="fa fa-caret-down"></i>
            <div class="dropdown-content">
                <button onclick="switch_status('${req.id}', 'new')">Новая</button>
                <button onclick="switch_status('${req.id}', 'process')">В процессе</button>
                <button onclick="switch_status('${req.id}', 'done')">Выполнена</button>
            </div>
        </div>
        <button class="chat-button">Чат по заявке</button>
    `;

    if (showUser) {
        reqCard.querySelector('.safe-user').textContent = req.user || '—';
    } else {
        reqCard.querySelector('.request-user').remove();
    }

    reqCard.querySelector('.safe-title').textContent      = req.title;
    reqCard.querySelector('.safe-category').textContent   = req.category || 'нет';
    reqCard.querySelector('.safe-start-date').textContent = loadDate(req.start_date);
    reqCard.querySelector('.safe-close-date').textContent = loadDate(req.close_date);
    reqCard.querySelector('.safe-text').textContent       = req.request_text;
    fillStatus(reqCard, req.status);
    reqCard.querySelector('.chat-button').onclick = () =>
        openTicketChat(req.id, currentId, req.title);

    return reqCard;
}


function loadAllRequests(currentId) {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList  = document.getElementById("requests-list");

    requestsTitle.innerText = "История всех заявок";
    currentRequestsView = () => loadAllRequests(currentId);

    fetch('/api/requests')   // без user_id → бэк отдаёт все (только для admin)
        .then(response => {
            if (!response.ok) throw new Error("Ошибка при загрузке данных с сервера");
            return response.json();
        })
        .then(requests => {
            requestsList.innerHTML = "";

            if (requests.length === 0) {
                requestsList.innerHTML = '<p style="color: gray;">Заявок пока нет.</p>';
                return;
            }

            const counts = {
                all:    requests.length,
                active: requests.filter(r => r.status !== 'done').length,
                done:   requests.filter(r => r.status === 'done').length,
            };

            // --- фильтры ---
            const filterRow = document.createElement('div');
            filterRow.style.cssText = "display:flex; gap:8px; margin-bottom:12px;";
            filterRow.innerHTML = `
                <button class="filter-btn active" data-filter="all">Все (${counts.all})</button>
                <button class="filter-btn" data-filter="active">Активные (${counts.active})</button>
                <button class="filter-btn" data-filter="done">Выполненные (${counts.done})</button>
            `;
            requestsList.appendChild(filterRow);

            const listContainer = document.createElement('div');
            requestsList.appendChild(listContainer);

            function renderFiltered(filter) {
                listContainer.innerHTML = "";

                const filtered =
                    filter === 'active' ? requests.filter(r => r.status !== 'done') :
                    filter === 'done'   ? requests.filter(r => r.status === 'done')   :
                                          requests;

                if (filtered.length === 0) {
                    listContainer.innerHTML =
                        '<p style="color: gray;">Нет заявок в этой категории.</p>';
                    return;
                }

                filtered.forEach(req => {
                    // В общей истории заявки разных людей, поэтому имя показываем
                    listContainer.appendChild(createAdminRequestCard(req, currentId, true));
                });
            }

            filterRow.querySelectorAll('.filter-btn').forEach(btn => {
                btn.onclick = () => {
                    filterRow.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderFiltered(btn.dataset.filter);
                };
            });

            renderFiltered('all');
        })
        .catch(err => {
            console.error("Ошибка fetch:", err);
            requestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
}

/* ===================== Вид 3: Статистика ===================== */

function loadStatistics() {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList  = document.getElementById("requests-list");

    requestsTitle.innerText = "Статистика по заявкам";
    currentRequestsView = () => loadStatistics();   // «обновить» в текущем виде

    fetch('/api/requests/statistics')
        .then(r => {
            if (!r.ok) throw new Error("Ошибка загрузки статистики");
            return r.json();
        })
        .then(stats => {
            requestsList.innerHTML = "";

            // --- 1. Сводка ---
            const summary = document.createElement('div');
            summary.className = 'stats-summary';
            summary.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">${stats.total}</div>
                    <div class="stat-label">Всего заявок</div>
                </div>
                <div class="stat-card stat-active">
                    <div class="stat-value">${stats.active}</div>
                    <div class="stat-label">Активные</div>
                </div>
                <div class="stat-card stat-done">
                    <div class="stat-value">${stats.done}</div>
                    <div class="stat-label">Выполненные</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.percent_done}%</div>
                    <div class="stat-label">Доля выполненных</div>
                </div>
            `;
            requestsList.appendChild(summary);

            // --- 2. По статусам (полоски) ---
            const statusBlock = document.createElement('div');
            statusBlock.className = 'stats-block';
            statusBlock.innerHTML = '<h3>По статусам</h3>';

            const statusLabels = { new: 'В обработке', process: 'В процессе', done: 'Готово' };
            const statusColors = { new: 'var(--blue-500)', process: 'var(--amber-500)', done: 'var(--green-500)' };

            Object.entries(stats.by_status).forEach(([key, cnt]) => {
                const pct = stats.total ? Math.round((cnt / stats.total) * 100) : 0;
                const row = document.createElement('div');
                row.className = 'bar-row';
                row.innerHTML = `
                    <span class="bar-label"></span>
                    <div class="bar-track">
                        <div class="bar-fill"
                             style="width:${pct}%; background:${statusColors[key] || 'var(--text-muted)'};">
                        </div>
                    </div>
                    <span class="bar-count">${cnt}</span>
                `;
                row.querySelector('.bar-label').textContent = statusLabels[key] || key;
                statusBlock.appendChild(row);
            });
            requestsList.appendChild(statusBlock);

            // --- 3. По категориям ---
            if (stats.by_category.length) {
                const catBlock = document.createElement('div');
                catBlock.className = 'stats-block';
                catBlock.innerHTML = '<h3>По категориям (топ проблем)</h3>';

                const maxCat = Math.max(...stats.by_category.map(c => c.count));
                stats.by_category.forEach(c => {
                    const pct = maxCat ? Math.round((c.count / maxCat) * 100) : 0;
                    const row = document.createElement('div');
                    row.className = 'bar-row';
                    row.innerHTML = `
                        <span class="bar-label"></span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%; background:var(--violet-500);"></div>
                        </div>
                        <span class="bar-count">${c.count}</span>
                    `;
                    row.querySelector('.bar-label').textContent = c.category;
                    catBlock.appendChild(row);
                });
                requestsList.appendChild(catBlock);
            }

            // --- 4. По пользователям (топ-5) ---
            if (stats.by_user.length) {
                const userBlock = document.createElement('div');
                userBlock.className = 'stats-block';
                userBlock.innerHTML = '<h3>Топ пользователей по заявкам</h3>';

                const topUsers = stats.by_user.slice(0, 5);
                const maxTotal = Math.max(...topUsers.map(u => u.total));

                topUsers.forEach(u => {
                    const pct = maxTotal ? Math.round((u.total / maxTotal) * 100) : 0;
                    const row = document.createElement('div');
                    row.className = 'bar-row';
                    row.innerHTML = `
                        <span class="bar-label"></span>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${pct}%; background:var(--heading);"></div>
                        </div>
                        <span class="bar-count" title="активных: ${u.active}, выполнено: ${u.done}">
                            ${u.total}
                        </span>
                    `;
                    row.querySelector('.bar-label').textContent =
                        `${u.user_name} ${u.room_num ? `(${u.room_num})` : ''}`;
                    userBlock.appendChild(row);
                });
                requestsList.appendChild(userBlock);
            }
        })
        .catch(err => {
            console.error("Ошибка статистики:", err);
            requestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить статистику.</p>';
        });
}

function switch_status(request_id, new_status, user_id, user_name) {
    fetch(`/api/request_switch/${request_id}/${new_status}`, {
        method: 'POST',
        headers: csrfHeaders()
    })
        .then(r => r.json())          // ← было .then(data => ...) без .json() — data.message был undefined
        .then(data => {
            console.log(data.message);
            if (currentRequestsView) currentRequestsView();
        })
        .catch(err => console.error("Ошибка смены статуса:", err));

}



function openTicketChat(requestId, currentId, requestTitle) {

    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
    const chatTabBtn = document.querySelector('.tab-btn[onclick*="chat"]') || document.querySelectorAll('.tab-btn')[1];
    if (chatTabBtn) chatTabBtn.click();

    // 2. Инициализируем контейнер чата в правой панели
    const rightContent = document.querySelector('#tab-chat');
    rightContent.innerHTML = `
    <div class="chat-window">
        <h4 class="chat-header">Чат по заявке #${requestId}</h4>
        <p class="title">Тема: <span id="chat-title"></span></p>

        <div id="chat-messages-box"></div>

        <div style="display:flex; gap:10px; align-items:center;">
            <input type="file" id="chat-file-input" accept="image/*" style="display:none;">
            <button class="dropbtn" id="attach-btn" title="Прикрепить изображение">📎</button>
            <input type="text" id="chat-input-text" placeholder="Напишите ответ..."
                    style="flex:1; margin:0; padding:10px; border-radius:4px;">
            <button class="dropbtn" id="send-chat-btn">Отправить</button>
        </div>
    </div>
    `;
    document.getElementById('chat-title').textContent = requestTitle;



    // 3. Функция загрузки сообщений с сервера
    function loadChatHistory() {
        fetch(`/api/get_chat/${requestId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Нет доступа к этому чату");
                }
                return response.json();
            })
            .then(res => {
                const msgBox = document.getElementById('chat-messages-box');
                if (!msgBox) return;

                msgBox.innerHTML = '';
                if (res.history.length === 0) {
                    msgBox.innerHTML = '<p style="color: gray; text-align: center; font-size: 12px;">Сообщений пока нет</p>';
                    return;
                }

                res.history.forEach(msg => {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = "message-box"

                    //Выравниваем по братику
                    const isMine = Number(msg.sender_id) === Number(currentId);

                    messageDiv.style.alignSelf = isMine ? 'flex-end' : 'flex-start';
                    messageDiv.style.background = isMine ? 'var(--chat-mine-bg)' : 'var(--chat-other-bg)';

                    if (msg.type === 'image' && msg.file_path) {
                        const url = '/' + msg.file_path;
                        messageDiv.innerHTML = `
                            <img src="${url}" alt="изображение"
                                 style="max-width:240px; max-height:240px; border-radius:6px; cursor:zoom-in; display:block;">
                            <span class="message-date"></span>
                        `;
                        messageDiv.querySelector('img').onclick = () => window.open(url, '_blank');
                    } else {
                        messageDiv.innerHTML = `
                            <p class="message"></p>
                            <span class="message-date"></span>
                        `;
                        messageDiv.querySelector('.message').textContent = msg.text;
                    }

                    messageDiv.querySelector('.message-date').textContent =
                        msg.timestamp.split(' ')[1] || '';
                    msgBox.appendChild(messageDiv);
                });

               // msgBox.scrollTop = msgBox.scrollHeight; --  сделать обработку на новые сообщения 
            })
            .catch(err => {
                const msgBox = document.getElementById('chat-messages-box');

                if (msgBox) msgBox.innerHTML = `<p style="color:red;">${err.message}</p>`;
                console.error(err);
            });
    }
    loadChatHistory();


    if (chatInterval) clearInterval(chatInterval);
    chatInterval = setInterval(loadChatHistory, 3000);


    document.getElementById('send-chat-btn').onclick = function () {
        const input = document.getElementById('chat-input-text');
        const text = input.value.trim();
        if (!text) return;

        fetch('/api/send_chat_message', {
            method: 'POST',
            headers: csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                request_id: requestId,
                text: text
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    input.value = ''; // Очищаем поле ввода
                    loadChatHistory(); // Сразу обновляем экран, не дожидаясь таймера
                }
            });
    };

    document.getElementById('attach-btn').onclick = () => {
        document.getElementById('chat-file-input').click();
    };

    document.getElementById('chat-file-input').onchange = async function () {
        const file = this.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("Файл больше 5 МБ");
            this.value = '';
            return;
        }

        const fd = new FormData();
        fd.append('file', file);

        try {
            const res = await fetch(`/api/upload_chat_file/${requestId}`, {
                method: 'POST',
                headers: csrfHeaders(),
                body: fd
            });
            const data = await res.json();
            if (data.status === 'success') {
                this.value = '';
                loadChatHistory();
            } else {
                alert(data.error || 'Не удалось загрузить файл');
            }
        } catch (e) {
            alert('Ошибка сети');
        }
    };
}



