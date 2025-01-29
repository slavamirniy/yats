# Task System Package

Фреймворк для работы с задачами и активностями, поддерживающий различные протоколы коммуникации.

## Установка

```bash
npm install github:YOUR_USERNAME/TaskSystemPackage
```

## Использование

### API Протокол

```typescript
import { ApiProtocol } from 'task-system-package';

// Создание экземпляра API протокола
const api = new ApiProtocol('localhost', 3000);

// Запуск в режиме воркера
await api.startAsWorker();

// Отправка задачи
const result = await api.send('activityName', { /* входные данные */ });
```

### Queue Протокол

```typescript
import { QueueProtocol, IQueueStorage } from 'task-system-package';

// Реализация хранилища очереди
class MyQueueStorage implements IQueueStorage {
    // ... реализация методов
}

// Создание экземпляра Queue протокола
const queue = new QueueProtocol(new MyQueueStorage(), (cmd) => {
    // Логика обработки очереди
});

// Запуск в режиме воркера
await queue.startAsWorker();

// Отправка задачи
const result = await queue.send('activityName', { /* входные данные */ });
```

## Особенности

- Поддержка API протокола через Express
- Поддержка очередей с пользовательской реализацией хранилища
- Типизация с помощью TypeScript
- Асинхронная обработка задач
- Система промежуточных обработчиков (middlewares)
- Гибкая система хранения состояний

## Документация

### Протоколы

#### ApiProtocol
Протокол для коммуникации через HTTP API.

#### QueueProtocol
Протокол для работы с очередями задач.

### Интерфейсы

#### IQueueStorage
Интерфейс для реализации хранилища очереди.

#### IActivitesProvider
Базовый интерфейс для провайдера активностей.

## Лицензия

MIT 
