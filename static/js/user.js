
const openBtn = document.getElementById('openPanelBtn');
const closeBtn = document.getElementById('closePanelBtn');
const panel = document.getElementById('infoPanel');

const solutionBox = document.getElementById('solution-box');

// Открыть панель по клике на верхнюю левую кнопку
openBtn.addEventListener('click', () => {
    panel.classList.add('active');
    panel2.classList.remove('active');
});

// Закрыть панель
closeBtn.addEventListener('click', () => {
    panel.classList.remove('active');
    solutionBox.classList.remove('active')
});

const openBtn2 = document.getElementById('openPanelBtn2');
const closeBtn2 = document.getElementById('closePanelBtn2');
const panel2 = document.getElementById('Panelrequests');

// Открыть панель по клике на верхнюю левую кнопку
openBtn2.addEventListener('click', () => {
    loadUserRequests();   // при каждом открытии показываем актуальные статусы
    panel2.classList.add('active');
    panel.classList.remove('active');
    solutionBox.classList.remove('active')
});


// Закрыть панель
closeBtn2.addEventListener('click', () => {
    panel2.classList.remove('active');

});



document.getElementById('category-select').addEventListener('change', function () {
    const category = this.value;


    // Если пользователь сбросил выбор на "Выберите проблему", прячем блок
    if (!category) {
        solutionBox.classList.remove('active')

        return;
    } else {
        solutionBox.classList.add('active')
    }

    // Запрашиваем решение у Flask
    fetch(`/api/get_solution/${category}`)
        .then(response => response.json())


        .then(res => {
            if (res.status === 'success') {
                // Заполняем блок текстом из базы данных и плавно показываем
                solutionBox.innerHTML = '<div> </div>'
                solutionBox.style.display = 'block';


                res.data.forEach((req) => {
                    const solCard = document.createElement('div');
                    solCard.className = 'solotion';

                    solCard.innerHTML = `
                        <h4>#<span class="sol-title"></span></h4>
                        <p>Текст: <span class="sol-text"></span></p>
                    `;
                    solCard.querySelector('.sol-title').textContent = req.title;
                    solCard.querySelector('.sol-text').textContent = req.solution;
                    
                    solutionBox.appendChild(solCard);
                });


            } else {
                // Если для этой категории нет подсказки в базе знаний
                solutionBox.style.display = 'none';
            }


        })
        .catch(err => {
            console.error('Ошибка базы знаний:', err);
            solutionBox.style.display = 'none';
        });
});

const userRequestsList = document.getElementById('user-requests-list');

// Загружает заявки пользователя с сервера и рисует карточки
function loadUserRequests() {
    const userId = userRequestsList.dataset.userId;

    fetch(`/api/requests/${userId}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error('Ошибка при загрузке заявок');
            }
            return response.json();
        })
        .then((requests) => {
            userRequestsList.innerHTML = '';

            if (requests.length === 0) {
                userRequestsList.innerHTML =
                    '<p class="no-requests">Вы еще не отправляли ни одной заявки.</p>';
                return;
            }

            requests.forEach((req) => {
                userRequestsList.appendChild(createUserRequestCard(req, userId));
            });
        })
        .catch((err) => {
            console.error(err);
            userRequestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
}

// Карточка заявки для пользователя: без смены статуса, но с кнопкой отмены
function createUserRequestCard(req, userId) {
    const card = document.createElement('div');
    card.className = 'request';

    // В разметке только пустые элементы, данные вставляются через textContent
    card.innerHTML = `
        <h4></h4>
        <p>Описание проблемы: <span class="req-text"></span></p>
        <p>Категория: <span class="req-category"></span></p>
        <p>Дата создания: <span class="req-start-date"></span></p>
         <p class="code">Дата закрытия: <span class="safe-close-date"></span></p>
         
        <p>Статус: <span class="status-badge"></span></p>
        <button class="sidebar-btn req-chat-btn" style="margin-top: 10px;">Чат по заявке</button>
    `;

    card.querySelector('h4').textContent = `#${req.id}: ${req.title ?? ''}`;
    card.querySelector('.req-text').textContent = req.request_text ?? '';
    card.querySelector('.req-category').textContent = req.category || 'не выбрана';
    card.querySelector('.req-start-date').textContent = loadDate(req.start_date);
    card.querySelector('.safe-close-date').textContent =  loadDate(req.close_date);

    const badge = card.querySelector('.status-badge');
    badge.className = `status-badge status-${req.status.toLowerCase()}`;
    badge.textContent = req.status;

    card.querySelector('.req-chat-btn').onclick = () =>
        openTicketChat(req.id, userId, req.title);

    // Отменить можно только незакрытую заявку
    if (['new', 'process'].includes(req.status)) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'sidebar-btn';
        cancelBtn.style.marginTop = '10px';
        cancelBtn.textContent = '✖ Отменить заявку';
        cancelBtn.onclick = () => cancelRequest(req.id);
        card.appendChild(cancelBtn);
    }

    return card;
}

// К DOMContentLoaded уже загружен admin.js, где лежат loadDate и openTicketChat
document.addEventListener('DOMContentLoaded', loadUserRequests);

function cancelRequest(requestId) {
    if (!confirm(" отменить эту заявку?")) {
        return; 
    }

    fetch(`/api/cancel_request/${requestId}`, {
        method: 'POST',
        headers: csrfHeaders()
    })
    .then(response => {
        if (response.ok) {
            // Перерисовываем только список, без перезагрузки страницы
            loadUserRequests();
        } else {
            alert("Не удалось отменить заявку. Возможно, она уже закрыта.");
        }
    })
    .catch(err => {
        console.error("Ошибка:", err);
        alert("Произошла ошибка при соединении с сервером.");
    });
}
