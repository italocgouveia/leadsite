# ===================================================================
#  Para o worker de geracao por IA.
#
#  Esta logica vive num .ps1 e nao embutida no .bat de proposito: como
#  one-liner dentro de `powershell -Command`, as aspas do filtro CIM
#  precisavam de tres niveis de escape e quebravam em silencio - o .bat
#  saia com erro e ninguem parava nada. Arquivo separado, sem escape.
#
#  NAO mexe na bridge, no tunnel, na automacao nem em campanha nenhuma.
#  Parar a geracao nao cancela nada: os leads continuam na fila e voltam
#  a ser processados quando o worker subir de novo.
# ===================================================================

$ErrorActionPreference = 'SilentlyContinue'

# O supervisor PRIMEIRO: na ordem inversa ele veria o worker cair e
# subiria outro em 5 segundos, e o "parar" nao pararia nada.
# So node.exe e cmd.exe entram na conta, e nunca este processo.
#
# Sem esse cerco o script SE MATAVA: o filtro '*worker-geracao*' casa com
# a linha de comando de qualquer shell que contenha esse texto - inclusive
# o shell que esta rodando este proprio script - e o /T derrubava a
# sessao inteira antes de matar o worker. Falhava sem imprimir nada, que e
# o pior jeito de falhar.
$meu = $PID

# Varre por 3 segundos, nao uma vez so.
#
# Uma passada unica deixava escapar quem estava NASCENDO: o iniciar dispara
# wscript -> cmd -> node, e se o kill acontece no meio dessa cadeia ele nao
# encontra nada para matar e o node aparece logo depois. Repetir por alguns
# segundos pega a cadeia inteira, inclusive o wscript que ainda nem gerou o
# cmd. Foi essa janela que deixou os testes intermitentes.
$fimVarredura = (Get-Date).AddSeconds(3)
do {
  $alvos = Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq 'node.exe' -or $_.Name -eq 'cmd.exe' -or $_.Name -eq 'wscript.exe') -and
      $_.ProcessId -ne $meu -and
      ($_.CommandLine -like '*servico-geracao.*' -or $_.CommandLine -like '*worker-geracao.ts*')
    }

  foreach ($p in $alvos) {
    # /T mata a arvore: o tsx roda o script num processo filho, e matar so
    # o pai deixava a folha viva segurando a porta 8477.
    taskkill /F /T /PID $p.ProcessId 2>&1 | Out-Null
  }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $fimVarredura)

# Espera a porta fechar de fato (ate 10s). Sem isto, quem chama seguia em
# frente enquanto o worker antigo ainda estava morrendo - foi assim que os
# testes ficaram intermitentes.
$fim = (Get-Date).AddSeconds(10)
while ((Get-Date) -lt $fim) {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $c.Connect('127.0.0.1', 8477)
    $c.Close()
    Start-Sleep -Milliseconds 300
  } catch {
    break
  }
}

Write-Output "Worker de geracao parado. A fila esta intacta."
