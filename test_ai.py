from langchain_ollama import ChatOllama

# Указываем IP-адрес твоего сервера в REG.RU
llm = ChatOllama(
    base_url="http://168.222.142.182:11434",
    model="qwen2.5-coder:7b",
    temperature=0.1 # Делаем ответы более точными и детерминированными
)

print("Отправляю запрос на сервер...")

# Тестируем удаленную генерацию
response = llm.invoke("Привет! Ответь коротко: что такое RAG в машинном обучении?")
print("\nОтвет от 1221-Ассистента:")
print(response.content)