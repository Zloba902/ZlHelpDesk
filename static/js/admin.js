
let chatInterval = null
let currentRequestsView = null;
const statusLabels = { new: 'Новая', process: 'В процессе', done: 'Выполнена' };

// Подписи тем заявок (значения category из базы)
const categoryLabels = { internet: 'Сеть', printer: 'Принтер', password: 'Вход в сеть' };

function categoryLabel(category) {
    return categoryLabels[category] || category || 'Без темы';
}

// Заголовок с CSRF-токеном для всех POST-запросов
function csrfHeaders(extra = {}) {
    const token = document.querySelector('meta[name="csrf-token"]').content;
    return { ...extra, 'X-CSRF-Token': token };
}

// Статус выводится только через textContent, без вставки в HTML
function fillStatus(card, status) {
    card.querySelector('.dropbtn').className = `dropbtn status-${status.toLowerCase()}`;
    card.querySelector('.status-badge').textContent = statusLabels[status];

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

function loadDate(dateDB) {
    if (dateDB == null) {
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

    reqCard.querySelector('.safe-title').textContent = req.title;
    reqCard.querySelector('.safe-category').textContent = req.category || 'нет';
    reqCard.querySelector('.safe-start-date').textContent = loadDate(req.start_date);
    reqCard.querySelector('.safe-close-date').textContent = loadDate(req.close_date);
    reqCard.querySelector('.safe-text').textContent = req.request_text;
  
    fillStatus(reqCard,  req.status);
    reqCard.querySelector('.chat-button').onclick = () =>
        openTicketChat(req.id, currentId, req.title);

    return reqCard;
}


// Фильтры истории заявок хранятся вне функции: после смены статуса
// список загружается заново, и выбранные фильтры не должны сбрасываться
const historyFilters = { status: 'all', query: '', userId: '' };

// Приводим текст к виду для поиска: нижний регистр, «ё» как «е»
function normalizeForSearch(text) {
    return String(text ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

// Подходит ли заявка под строку поиска: номер, тема, текст, автор, тема, статус
function matchesQuery(req, query) {
    if (!query) return true;
    const haystack = normalizeForSearch([
        `#${req.id}`,
        req.title,
        req.request_text,
        req.user,
        categoryLabel(req.category),
        statusLabels[req.status],
    ].join(' '));
    return haystack.includes(query);
}

function loadAllRequests(currentId) {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList = document.getElementById("requests-list");

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

            // --- Строка поиска и выбор пользователя ---
            const toolbar = document.createElement('div');
            toolbar.className = 'history-toolbar';
            toolbar.innerHTML = `
                <input type="search" class="history-search"
                       placeholder="Поиск: номер, тема, текст, пользователь…">
                <select class="history-user">
                    <option value="">Все пользователи</option>
                </select>
            `;
            requestsList.appendChild(toolbar);

            const searchInput = toolbar.querySelector('.history-search');
            const userSelect = toolbar.querySelector('.history-user');

            // Список пользователей собираем из самих заявок: id → имя и количество
            const users = new Map();
            requests.forEach(r => {
                const entry = users.get(r.user_id) || { name: r.user || '—', count: 0 };
                entry.count += 1;
                users.set(r.user_id, entry);
            });
            [...users.entries()]
                .sort((a, b) => a[1].name.localeCompare(b[1].name, 'ru'))
                .forEach(([id, u]) => {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = `${u.name} (${u.count})`;   // имя — только как текст
                    userSelect.appendChild(option);
                });

            // Восстанавливаем прошлые значения (если пользователь ещё есть в списке)
            searchInput.value = historyFilters.query;
            if (!users.has(Number(historyFilters.userId))) historyFilters.userId = '';
            userSelect.value = historyFilters.userId;

            // --- Кнопки по статусу ---
            const filterRow = document.createElement('div');
            filterRow.className = 'history-filters';
            filterRow.innerHTML = `
                <button class="filter-btn" data-filter="all"></button>
                <button class="filter-btn" data-filter="active"></button>
                <button class="filter-btn" data-filter="done"></button>
            `;
            requestsList.appendChild(filterRow);

            const found = document.createElement('p');
            found.className = 'history-found';
            requestsList.appendChild(found);

            const listContainer = document.createElement('div');
            requestsList.appendChild(listContainer);

            function render() {
                const query = normalizeForSearch(historyFilters.query.trim());

                // Сначала поиск и пользователь, потом статус: так числа на кнопках
                // показывают, сколько заявок найдётся в каждой группе
                const base = requests.filter(r =>
                    (!historyFilters.userId || String(r.user_id) === historyFilters.userId) &&
                    matchesQuery(r, query));

                const groups = {
                    all: base,
                    active: base.filter(r => r.status !== 'done'),
                    done: base.filter(r => r.status === 'done'),
                };
                const names = { all: 'Все', active: 'Активные', done: 'Выполненные' };

                filterRow.querySelectorAll('.filter-btn').forEach(btn => {
                    const key = btn.dataset.filter;
                    btn.textContent = `${names[key]} (${groups[key].length})`;
                    btn.classList.toggle('active', key === historyFilters.status);
                });

                const filtered = groups[historyFilters.status];
                const isFiltered = query || historyFilters.userId;
                found.textContent = isFiltered ? `Найдено: ${filtered.length}` : '';

                listContainer.innerHTML = "";
                if (filtered.length === 0) {
                    listContainer.innerHTML = isFiltered
                        ? '<p style="color: gray;">Ничего не найдено. Попробуйте изменить запрос.</p>'
                        : '<p style="color: gray;">Нет заявок в этой категории.</p>';
                    return;
                }

                filtered.forEach(req => {
                    // В общей истории заявки разных людей, поэтому имя показываем
                    listContainer.appendChild(createAdminRequestCard(req, currentId, true));
                });
            }

            // Поиск срабатывает сразу при вводе
            searchInput.addEventListener('input', () => {
                historyFilters.query = searchInput.value;
                render();
            });
            userSelect.addEventListener('change', () => {
                historyFilters.userId = userSelect.value;
                render();
            });
            filterRow.querySelectorAll('.filter-btn').forEach(btn => {
                btn.onclick = () => {
                    historyFilters.status = btn.dataset.filter;
                    render();
                };
            });

            render();
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
    const requestsList = document.getElementById("requests-list");

    requestsTitle.innerText = "Статистика по заявкам";
    currentRequestsView = () => loadStatistics();   // «обновить» в текущем виде

    fetch('/api/requests/statistics')
        .then(r => {
            if (!r.ok) throw new Error("Ошибка загрузки статистики");
            return r.json();
        })
        .then(stats => {
            requestsList.innerHTML = "";

            if (stats.total === 0) {
                requestsList.innerHTML =
                    '<p class="stats-empty">Заявок пока нет. Статистика появится после первой заявки.</p>';
                return;
            }

            // --- 1. Плитки с главными числами ---
            const tiles = document.createElement('div');
            tiles.className = 'stats-summary';
            [
                ['Всего заявок', stats.total, ''],
                ['Активные', stats.active, 'новые и в процессе'],
                ['Создано сегодня', stats.created_today, `вчера: ${stats.created_yesterday}`],
                ['Закрыто сегодня', stats.closed_today, `вчера: ${stats.closed_yesterday}`],
                ['Среднее время решения', formatDuration(stats.avg_resolution_hours),
                    `по ${stats.done} выполненным`],
            ].forEach(([label, value, note]) => tiles.appendChild(createStatTile(label, value, note)));
            requestsList.appendChild(tiles);

            // --- 2. Кольцевые диаграммы ---
            const charts = document.createElement('div');
            charts.className = 'stats-charts';

            // Цвет закреплён за статусом, а не за местом в списке
            const statusKeys = ['new', 'process', 'done',
                ...Object.keys(stats.by_status).filter(s => !(s in statusLabels))];
            const statusParts = statusKeys.map(s => ({
                label: statusLabels[s] || s,
                value: stats.by_status[s] || 0,
                color: STATUS_CHART_COLORS[s] || 'var(--chart-other)',
            }));
            charts.appendChild(createDonutCard('По статусам', statusParts,
                `${stats.percent_done}%`, 'выполнено'));

            const categoryParts = stats.by_category.map(c => ({
                label: categoryLabel(c.category),
                value: c.count,
                color: CATEGORY_CHART_COLORS[c.category] || 'var(--chart-other)',
            }));
            charts.appendChild(createDonutCard('По темам', categoryParts, stats.total, 'заявок'));
            requestsList.appendChild(charts);

            // --- 3. Кто чаще обращается (топ-5) ---
            if (stats.by_user.length) {
                const userBlock = document.createElement('div');
                userBlock.className = 'stats-block';
                userBlock.innerHTML = '<h3>Кто чаще обращается</h3>';

                const topUsers = stats.by_user.slice(0, 5);
                const maxTotal = topUsers[0].total;

                topUsers.forEach(u => {
                    const pct = maxTotal ? Math.round((u.total / maxTotal) * 100) : 0;
                    const row = document.createElement('div');
                    row.className = 'user-row';
                    row.title = `активных: ${u.active}, выполнено: ${u.done}`;
                    row.innerHTML = `
                        <span class="user-name"></span>
                        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
                        <span class="bar-count">${u.total}</span>
                        <span class="user-topic"></span>
                    `;
                    row.querySelector('.user-name').textContent =
                        u.room_num ? `${u.user_name} (каб. ${u.room_num})` : u.user_name;
                    row.querySelector('.user-topic').textContent =
                        `чаще всего: ${categoryLabel(u.top_category)}`;
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

// Цвета диаграмм: статусы совпадают с полосками на карточках, темы — свои
const STATUS_CHART_COLORS = {
    new: 'var(--status-new-line)',
    process: 'var(--status-process-line)',
    done: 'var(--status-done-line)',
};
const CATEGORY_CHART_COLORS = {
    internet: 'var(--chart-1)',
    printer: 'var(--chart-2)',
    password: 'var(--chart-3)',
};

// Часы → «45 мин», «3,5 ч» или «2,1 дн»
function formatDuration(hours) {
    if (hours === null || hours === undefined) return '—';
    const fmt = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} мин`;
    if (hours < 24) return `${fmt(hours)} ч`;
    return `${fmt(hours / 24)} дн`;
}

// Плитка с одним числом
function createStatTile(label, value, note) {
    const tile = document.createElement('div');
    tile.className = 'stat-card';
    tile.innerHTML = `
        <div class="stat-value"></div>
        <div class="stat-label"></div>
        <div class="stat-note"></div>
    `;
    tile.querySelector('.stat-value').textContent = value;
    tile.querySelector('.stat-label').textContent = label;
    tile.querySelector('.stat-note').textContent = note;
    return tile;
}

// Кольцевая диаграмма с легендой и подсказкой при наведении.
// parts: [{ label, value, color }]
function createDonutCard(title, parts, centerValue, centerCaption) {
    const card = document.createElement('div');
    card.className = 'stats-block donut-card';
    card.innerHTML = `
        <h3></h3>
        <div class="donut-body">
            <div class="donut-wrap">
                <svg class="donut" viewBox="0 0 120 120" role="img">
                    <circle class="donut-track" cx="60" cy="60" r="46"></circle>
                    <g class="donut-segments" transform="rotate(-90 60 60)"></g>
                </svg>
                <div class="donut-center">
                    <span class="donut-center-value"></span>
                    <span class="donut-center-caption"></span>
                </div>
                <div class="chart-tooltip"></div>
            </div>
            <ul class="donut-legend"></ul>
        </div>
    `;
    card.querySelector('h3').textContent = title;
    card.querySelector('.donut-center-value').textContent = centerValue;
    card.querySelector('.donut-center-caption').textContent = centerCaption;

    const total = parts.reduce((sum, p) => sum + p.value, 0);
    const svg = card.querySelector('.donut');
    svg.setAttribute('aria-label',
        `${title}: ` + parts.map(p => `${p.label} ${p.value}`).join(', '));

    const group = card.querySelector('.donut-segments');
    const legend = card.querySelector('.donut-legend');
    const wrap = card.querySelector('.donut-wrap');
    const tooltip = card.querySelector('.chart-tooltip');

    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const visible = parts.filter(p => p.value > 0);
    const gap = visible.length > 1 ? 2 : 0;   // зазор между секторами
    let offset = 0;

    parts.forEach(part => {
        const pct = total ? Math.round((part.value / total) * 100) : 0;
        const text = `${part.label}: ${part.value} (${pct}%)`;

        // Строка легенды: цвет, название, число, процент
        const item = document.createElement('li');
        item.innerHTML = `
            <span class="legend-swatch"></span>
            <span class="legend-name"></span>
            <span class="legend-value">${part.value}</span>
            <span class="legend-pct">${pct}%</span>
        `;
        item.querySelector('.legend-swatch').style.background = part.color;
        item.querySelector('.legend-name').textContent = part.label;
        legend.appendChild(item);

        if (part.value === 0) return;   // у пустой части нет сектора

        const length = (part.value / total) * circumference;
        const segment = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        segment.setAttribute('class', 'donut-seg');
        segment.setAttribute('cx', 60);
        segment.setAttribute('cy', 60);
        segment.setAttribute('r', radius);
        segment.setAttribute('stroke-dasharray', `${Math.max(length - gap, 0.5)} ${circumference}`);
        segment.setAttribute('stroke-dashoffset', -offset);
        segment.style.stroke = part.color;
        group.appendChild(segment);
        offset += length;

        // Подсветка: при наведении на сектор или строку легенды
        const show = (event) => {
            card.classList.add('is-hovering');
            segment.classList.add('is-active');
            item.classList.add('is-active');
            tooltip.textContent = text;
            tooltip.classList.add('is-visible');
            if (event && event.type === 'mousemove') {
                const box = wrap.getBoundingClientRect();
                tooltip.style.left = `${event.clientX - box.left}px`;
                tooltip.style.top = `${event.clientY - box.top}px`;
            } else {
                tooltip.style.left = '50%';
                tooltip.style.top = '0px';
            }
        };
        const hide = () => {
            card.classList.remove('is-hovering');
            segment.classList.remove('is-active');
            item.classList.remove('is-active');
            tooltip.classList.remove('is-visible');
        };
        segment.addEventListener('mousemove', show);
        segment.addEventListener('mouseleave', hide);
        item.addEventListener('mouseenter', show);
        item.addEventListener('mouseleave', hide);
    });

    return card;
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
    var msgCount = 0;

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

        <div class = "chat-table">
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

                
                if (res.history.length === 0) {
                    msgBox.innerHTML = '<p style="color: gray; text-align: center; font-size: 12px;">Сообщений пока нет</p>';
                    return;
                }

                if (msgCount == res.history.length) {
                    return
                } else {
                    msgBox.innerHTML = '';
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

                        messageDiv.querySelector('.message-date').textContent = loadDate(msg.timestamp)
                        msgBox.appendChild(messageDiv);
                        msgCount = res.history.length
                        msgBox.scrollTop = msgBox.scrollHeight; 
                    });
                }

               
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



