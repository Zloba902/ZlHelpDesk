   function loadRequests(userId, userName) {
    const requestsTitle = document.getElementById('requests-title');
    const requestsList = document.getElementById('requests-list');

    // Меняем заголовок секции
    requestsTitle.innerText = `Заявки пользователя: ${userName}`;
    requestsList.innerHTML = '<p>Загрузка...</p>'; // Временный индикатор

    // Делаем асинхронный запрос к нашему Flask API
    fetch(`/api/user_requests/${userId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Ошибка при загрузке данных с сервера');
            }
            
            return response.json();
        })
        .then(requests => {
            // Очищаем контейнер перед выводом новых данных
            requestsList.innerHTML = '';

            // Если у пользователя нет заявок
            if (requests.length === 0) {
                requestsList.innerHTML = '<p style="color: gray;">У этого пользователя нет активных заявок.</p>';
                return;
            }

            // Проходимся по каждой заявке и строим структуру на основе полей из БД (id, title, request_text, status, code)
            requests.forEach(req => {
                const reqCard = document.createElement('div');
                reqCard.className = 'request-card'; // Стилизуешь в CSS на свой вкус
                reqCard.style.border = '1px solid #ccc';
                reqCard.style.padding = '10px';
                reqCard.style.marginBottom = '10px';
                reqCard.style.borderRadius = '5px';

                reqCard.innerHTML = `
                    <h4><strong>#${req.id}</strong>: ${req.title}</h4>
                    <p><strong>Текст:</strong> ${req.request_text}</p>
                    <p><strong>Код ошибки:</strong> <code>${req.code || 'нет'}</code></p>
                    <p><strong>Статус:</strong> <span class="status-badge">${req.status}</span></p>
                `;
                
                requestsList.appendChild(reqCard);
            });
        })
        .catch(error => {
            console.error('Ошибка fetch:', error);
            requestsList.innerHTML = '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
}

        
        