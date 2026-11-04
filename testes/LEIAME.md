# Teste das regras de segurança

Verifica, no emulador do Firestore, o que cada perfil consegue ler e gravar (35 situações).

```
npm i -g firebase-tools
npm i @firebase/rules-unit-testing@3 firebase@10.12.2
cp ../firestore.rules .
printf '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8085}}}' > firebase.json
npx firebase emulators:exec --only firestore --project demo-teste "node regras.test.mjs"
```
