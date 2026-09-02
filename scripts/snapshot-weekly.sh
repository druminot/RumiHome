#!/bin/bash
# Snapshot semanal del VPS vía API de Hostinger
# Nota: Hostinger permite solo 1 snapshot por VPS (el nuevo sobrescribe el anterior)
TOKEN=$(cat /root/.hostinger-token)
curl -s -X POST "https://developers.hostinger.com/api/vps/v1/virtual-machines/1948792/snapshot" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{}"
echo ""
