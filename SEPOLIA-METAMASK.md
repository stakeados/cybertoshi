# Prueba con MetaMask en Base Sepolia

Ejecutar desde el repositorio, con los contratos compilados por `npm test`:

```sh
npm run wallet:sepolia
```

Abrir http://127.0.0.1:5180/deploy.html en el perfil del navegador donde está MetaMask.
El servidor escucha únicamente en loopback. La herramienta está restringida a Base
Sepolia (84532) y a la cuenta de prueba `0x12B967b8b9eddB5185922375F1f7dC1F3791d9Dc`.
No pide, recibe ni almacena claves privadas.

1. Conectar MetaMask y seleccionar la cuenta indicada.
2. Firmar los tres despliegues, uno por botón: TestDex, renderer y colección.
   La colección crea BCAT y la tesorería. El valor enviado es cero; se paga gas de prueba.
3. Cada recibo espera dos confirmaciones. El servidor compara emisor, valor, datos
   de creación y argumentos con los artefactos compilados. Al terminar comprueba
   los enlaces entre contratos, el límite de 16.384 y el intervalo de 60 segundos.
4. Abrir la aplicación local con el botón que aparece al terminar.

La versión corregida elimina el cobro separado de ETH: solo se cobra al quemar el
NFT, junto con BCAT. El contrato anterior no es actualizable. Se reutilizan su
renderer y TestDex si sus transacciones coinciden con los artefactos compilados;
solo hace falta firmar una nueva colección, que crea otro token y otra tesorería.
Los gatos, saldos y cobros anteriores permanecen en el contrato de prueba antiguo.

Los nuevos recibos se guardan en `deployments/wallet-84532-burn-only.json`, conservando
el manifiesto anterior. La transacción pendiente
se conserva en el almacenamiento local del navegador para reintentar la verificación
sin volver a enviarla. No borrar ese almacenamiento mientras haya una transacción
pendiente. Una transacción revertida o reemplazada requiere revisar su recibo antes
de limpiar el pendiente manualmente; no reenviar a ciegas.

La configuración de Sepolia se escribe exclusivamente en
`output/wallet-sepolia/public/deployment.json`. La configuración pública de mainnet
permanece sin contratos y con el mint cerrado. No publicar la carpeta `output`.

## Qué falta comprobar después de desplegar

- Minteo real con CPU y GPU desde MetaMask, recibos y metadatos.
- Rechazo de un segundo mint antes de 60 segundos y aceptación después.
- Acumulación de ETH en los gatos anteriores, sin cobro separado; el saldo viaja con el NFT.
- Bootstrap del pool simulado, BCAT de reserva, custodia del LP, cobro de fees,
  quema del NFT y recompensa BCAT. Esto requiere ETH de prueba adicional o aportar
  explícitamente el importe restante hasta 0,02 ETH al vault de prueba.
- Recuperación de dificultad tras inactividad y evidencia de los resultados.

TestDex es un simulador: probarlo en Sepolia no equivale a verificar un mercado real.
La integración real con Aerodrome tiene una prueba separada en un fork de Base.
El despliegue en Sepolia tampoco sustituye la revisión independiente pendiente.
