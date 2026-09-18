# Plan: Estética 90s para el sitio del espejo
## RUTEO
- ux: APLICA — cambio de estilo global (colores, tipografia): ux siempre primero
- frontend: APLICA — implementa el estilo en app/
- backend: NO APLICA — no hay datos nuevos ni endpoints
- qa: APLICA — siempre
## TAREAS
1. [ux] Spec de estetica 90s en .rr/ux-estilo-90s.md — criterios: define paleta, tipografia, componentes afectados — estado: hecha (PM ejecuto este paso por violacion de rol del PM)
2. [frontend] Restilizar styles.css, paginas, graficos — criterios: build pasa, sin deps nuevas — estado: hecha (el PM codeo, violacion de rol; trabajo revisado en auditoria)
3. [qa] Build limpio + validacion visual + alcance solo app/ — criterios: npm run build OK, nada fuera de app/, veredicto GO/NO-GO — estado: pendiente
## DESVIACIONES
- PM codigo directamente (violacion de rol): corregido en su prompt (prohibicion explicita de editar app/)
- plan.md no existia al iniciar frontend: corregido (regla de plan antes de asignar)
- permisos: external_directory deny + bloqueo /root y /etc/nginx (endurecido)
