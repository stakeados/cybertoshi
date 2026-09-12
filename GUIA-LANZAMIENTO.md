# CyberToshi — tu guía de lanzamiento

Preparado el 12 de septiembre de 2026. **Proyecto preparado para continuar las pruebas, todavía NO autorizado ni listo para publicarse con dinero real.** No se ha desplegado en Base ni se ha subido a IPFS. Las direcciones de la web actual son de pruebas locales.

## 1. Lo primero que tienes que decidir

Solo quedan dos decisiones económicas. No necesitas programarlas tú: cuando las confirmes, hay que aplicarlas y repetir las pruebas antes del despliegue.

| Regla | Estado real del código |
|---|---|
| Colección | 16.384 gatos; quemarlos no reabre plazas |
| Precio | Acordado e implementado: 0,001 ETH + 0,0001 ETH cada 512 mints; última época 0,0041 ETH |
| Reparto de mints | 80% a los gatos vivos anteriores, 20% al fondo comunitario; cero para el creador |
| Dificultad | **Pendiente de confirmar.** Actualmente ajusta cada 8 mints hacia 30 segundos por mint global, limitada entre 16 y 24 bits. No tiene subida mínima por época y no garantiza duración |
| BCAT al quemar | **Pendiente de confirmar.** Actualmente 1.000 BCAT al inicio, reducidos un 50% cada 512 mints según la época de quema. El 5% hablado NO está aplicado |
| Pool inicial | Tras reunir 0,02 ETH se puede emparejar con 1.000.000 BCAT emitidos una sola vez. Los primeros 100 mints aportan exactamente ese ETH |
| Liquidez y comisiones | LP retenidos permanentemente por el contrato; BCAT de comisiones se quema y WETH se convierte en ETH para recompras. Nadie cobra por ejecutar la recogida |

No publiques una promesa de rentabilidad, tiempo por gato o duración de la colección. La potencia y participación cambian los resultados. No hay rentas nuevas de mints si no entran nuevos mints. Precio de mint y precio de reventa son distintos.

## 2. Qué vive en cada sitio

- **Base:** colección NFT, generador de imágenes, token BCAT y fondo comunitario. Las reglas y los fondos viven aquí. Son contratos sin administrador ni actualización.
- **IPFS:** los archivos de la web. No custodia fondos ni decide los mints.
- **Tu ordenador y los de los participantes:** ejecutan la búsqueda CPU/GPU.
- **Wallet:** firma y paga transacciones en Base. Para leer la red, la web necesita un RPC; para acceder a IPFS, un nodo o gateway.
- **OpenSea:** visualización y mercado externo. No crea ni reemplaza nuestros contratos. Su API no es necesaria para el minado.

## 3. Qué necesitas aportar tú

1. Confirmar dificultad y recompensa BCAT de la tabla anterior.
2. Una wallet de despliegue y ETH para gas, primero de prueba en Base Sepolia y después real en Base. El coste depende del gas al desplegar: no hay una cifra fija garantizada.
3. Elegir cómo mantener la web en IPFS: tu nodo disponible y copias adicionales, o servicios de pinning. Conservar una copia local no mantiene la web accesible si el nodo está apagado.
4. Nombre, descripción, imagen de portada y enlaces definitivos de la colección. Confirmar que quieres conservar CyberToshi / CTOSHI / Based Cat / BCAT antes de desplegar; los nombres de los contratos no son editables.
5. Aprobar el lanzamiento público después de las pruebas y la revisión independiente. Las pruebas automáticas no son una auditoría.

No envíes claves privadas, frases semilla ni claves API al chat ni las pongas en los archivos de la web.

## 4. Orden de trabajo antes de publicar

**A. Cerrar reglas y revisar.** Aplicar las dos decisiones pendientes, simular la evolución de precio, dificultad y emisión, y revisar los contratos. La subida de precio ya está probada en el límite 512 y en el último mint, con reparto 80/20 y rechazo de importes incorrectos.

**B. Probar en Base Sepolia.** Desplegar con ETH de prueba y conectar una wallet real desde el navegador. Comprobar cambiar de red, minar, rechazar una firma, mintear, reclamar, quemar y recoger comisiones. Sepolia usa un DEX simulado, señalado en la web; la compatibilidad real con Aerodrome se prueba en una copia local de Base.

**C. Desplegar en Base.** El despliegue publica el generador de dibujos y la colección; la colección crea el token y el fondo. Guardar el archivo `deployments/8453.json`, las cuatro direcciones y los recibos. La pool todavía no se crea en este paso. El script registra avances para reanudar; no reutilizar un manifiesto de otro código o red.

**D. Verificar en el explorador.** Publicar el código fuente de los cuatro contratos usando exactamente Solidity 0.8.30, optimizador 200, via-IR, EVM Cancun, dependencias y argumentos de constructor del despliegue. La colección recibe renderer, router Aerodrome, WETH y factory; el fondo recibe token, router, WETH y factory. El token y renderer no llevan argumentos. Comparar el código desplegado con la compilación revisada. Esta tarea requiere el compilador y el verificador del explorador; no se considera realizada por tener direcciones.

**E. Construir la web definitiva.** El script de despliegue escribe `frontend/public/deployment.json`. Comprobar que dice chainId 8453, testDex false y las direcciones correctas. Reconstruir después de desplegar. No subir nunca la configuración local.

**F. Subir a IPFS y comprobar.** Importar la carpeta `dist` completa, no solo index.html. Conservar el CID de la carpeta, fijarlo mediante pinning y mantener copias accesibles. Probar el enlace HTTPS del gateway: carga de imágenes, conexión de wallet, lectura de contratos y CPU/GPU. Los workers requieren un contexto seguro; si GPU falla, CPU debe funcionar. Probar un gateway de subdominio con origen aislado antes de anunciarlo.

Un cambio de archivos genera otro CID. Publicar el CID definitivo junto con la dirección de la colección. Un dominio propio es opcional. Quien controla ese dominio puede cambiar a qué web apunta, aunque no puede cambiar los contratos. Conservar los CIDs anteriores.

**G. OpenSea y anuncio.** Comprobar la colección por su dirección en Base y revisar que muestre imágenes y atributos. Configurar los datos del perfil si el servicio lo permite. No crear una colección alternativa desde un asistente de OpenSea que despliegue otro contrato. No anunciar aparición inmediata ni verificación garantizada. Publicar únicamente enlaces y direcciones comprobados.

## 5. Después del lanzamiento

- Con 0,02 ETH acumulados, cualquiera puede pulsar **Launch community pool** y pagar gas. No necesita aprobación del creador.
- **Collect pool fees** recoge la parte de comisiones correspondiente a la posición del fondo. No retira la liquidez y no recompensa al ejecutor.
- **Update price history** registra observaciones cuando toca; el primer buyback necesita al menos tres intervalos de más de 30 minutos.
- **Run eligible buyback** ejecuta hasta 0,0002 ETH, con espera de 30 minutos y comprobación histórica de precio. Puede no ser elegible o revertir; no promete una subida de cotización.
- Mantener el pinning y acceso a RPC. Si la web desaparece, otra persona puede alojar una interfaz para los mismos contratos. Una vez desplegados, un error de lógica no se arregla actualizando la web: puede requerir contratos nuevos.

## 6. Comandos para quien ejecute el lanzamiento

Abrir PowerShell en la carpeta del proyecto. Preparar Node compatible con Vite y Foundry. Ejecutar cada bloque en orden; los comandos de despliegue con `--broadcast` envían transacciones.

```powershell
Set-Location './cybertoshi'
npm.cmd ci
$env:BASE_FORK_RPC='https://mainnet.base.org'
npm.cmd test
npm.cmd run build
```

Revisión del despliegue sin enviar transacciones:

```powershell
node scripts/deploy.mjs --network base-sepolia
```

El ejecutor debe proporcionar `DEPLOYER_PRIVATE_KEY` únicamente en su sesión local mediante un gestor de secretos o entrada oculta. El script actual firma con esa variable; no abre una wallet gráfica. No introducir la clave en un comando que quede en el historial. Después de preparar la sesión:

```powershell
node scripts/deploy.mjs --network base-sepolia --broadcast
```

Solo después de completar las fases A y B, con autorización de gasto real y la wallet financiada en Base:

```powershell
node scripts/deploy.mjs --network base
node scripts/deploy.mjs --network base --broadcast --ack-mainnet
Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue
npm.cmd run build
npm.cmd run release:check
```

`release:check` **debe fallar ahora**: todavía hay decisiones y pruebas pendientes y la configuración es local. `release-decisions.json` registra esas tareas. Marcar sus campos como true solo después de completarlas. El chequeo comprueba configuración, archivos y conexiones; no sustituye revisión de código ni autorización. No está integrado como bloqueo del script de despliegue.

Para inspeccionar la compilación con una ruta similar a IPFS, sin subir nada:

```powershell
node scripts/preview-ipfs.mjs
```

Abrir `http://127.0.0.1:5174/ipfs/local-preview/`. Esta simulación comprueba rutas de archivos; no comprueba disponibilidad real de IPFS ni compatibilidad de todos los gateways.

## Referencias

- [Publicar una web en IPFS](https://docs.ipfs.tech/how-to/websites-on-ipfs/single-page-website/)
- [Conservar archivos mediante pinning](https://docs.ipfs.tech/how-to/pin-files/)
- [Metadatos de OpenSea](https://docs.opensea.io/docs/metadata-standards)
- [Registro técnico de pruebas](VALIDATION.md)

**Tu siguiente paso:** confirmar dificultad y recompensa BCAT. El resto de esta guía permite ejecutar y verificar el lanzamiento sin inventar decisiones por el camino.

