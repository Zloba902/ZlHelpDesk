
function loadRequests(userId, userName, currentId) {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList = document.getElementById("requests-list");

    requestsTitle.innerText = `Заявки пользователя: ${userName}`;

    fetch(`/api/user_requests/${userId}`)
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
                const reqCard = document.createElement('div');
                reqCard.className = 'request';

                reqCard.innerHTML = `
                    <h4>#${req.id}: ${req.title}</h4>
                    <p class = "code"> Код ошибки: ${req.category || "нет"}</p>
                    <p>Текст: ${req.request_text}</p>
                    <div class="dropdown">
                    <button class="dropbtn  status-${req.status.toLowerCase()}" id= "status">Статус: <span class="status-badge">${req.status}</span></button>
                    <i class="fa fa-caret-down"></i>
                    <div class="dropdown-content">
                            <button onclick="switch_status('${req.id}', 'new', '${userId}', '${userName}')">В обработке</button>
                            <button onclick="switch_status('${req.id}', 'process', '${userId}', '${userName}')">В процессе</button>
                            <button onclick="switch_status('${req.id}', 'done', '${userId}', '${userName}')">Готово</button>
                        </div>
                    </div>

                    <button class="chat-button" 
                    onclick="openTicketChat('${req.id}', '${currentId}', '${req.title}')">
                    Чат по заявке
                    </button>
                `;
                requestsList.appendChild(reqCard);
            });
        })
        .catch((error) => {
            console.error("Ошибка fetch:", error);
            requestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
}


function switch_status(request_id, new_status, user_id, user_name) {
    fetch(`/api/request_switch/${request_id}/${new_status}`)
        .then(data => {
            console.log(data.message);
            loadRequests(user_id, user_name);
        })

}

let chatInterval = null
window.addEventListener('beforeunload', () => {
    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
});



function openTicketChat(requestId, currentId, requestTitle) {

    if (chatInterval) { clearInterval(chatInterval); chatInterval = null; }
    const chatTabBtn = document.querySelector('.tab-btn[onclick*="chat"]') || document.querySelectorAll('.tab-btn')[1];
    if (chatTabBtn) chatTabBtn.click();

    // 2. Инициализируем контейнер чата в правой панели
    const rightContent = document.querySelector('#tab-chat'); 
    rightContent.innerHTML = `
    <div class = "chat-window">
        <h4 class="chat-header">Чат по заявке #${requestId}</h4>
        <p class="title">Тема: ${requestTitle}</p>
        
        <div id="chat-messages-box" style="">
            <p style="color: gray; text-align: center;">Загрузка истории...</p>
        </div>

        <div style="display: flex; gap: 10px;">
            <input type="text" id="chat-input-text" placeholder="Напишите ответ..." style="margin: 0; padding: 10px; border-radius: 4px;">
            <button class="dropbtn" id="send-chat-btn" style="width: auto; background: var(--accent); color: white;">Отправить</button>
        </div>
    </div>
    `;

    // 3. Функция загрузки сообщений с сервера
    function loadChatHistory() {
        fetch(`/api/get_chat/${requestId}`)
            .then(response => response.json())
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
                    messageDiv.style.background = isMine ? 'var(--frost-1)' : 'var(--frost-4)';

                    messageDiv.innerHTML = `
                        <p class="message" >${msg.text}</p>
                        <span class="message-date" >${msg.timestamp.split(' ')[1] || ''}</span>
                    `;
                    msgBox.appendChild(messageDiv);
                });

                msgBox.scrollTop = msgBox.scrollHeight;
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
            headers: { 'Content-Type': 'application/json' },
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
}
