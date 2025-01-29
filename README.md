# Task System Package

Фреймворк для работы с задачами и активностями, поддерживающий различные протоколы коммуникации.

## Установка

```bash
npm install github:YOUR_USERNAME/TaskSystemPackage
```

## Использование

```typescript
import { ApiProtocol } from 'task-system-package';

// Создание экземпляра API протокола
const api = new ApiProtocol('localhost', 3000);

// Запуск в режиме воркера
await api.startAsWorker();

// Отправка задачи
const result = await api.send('activityName', { /* входные данные */ });
```

## Особенности

- Поддержка API протокола через Express
- Типизация с помощью TypeScript
- Асинхронная обработка задач
- Поддержка очередей

## Лицензия

MIT 