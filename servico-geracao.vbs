' ====================================================================
'  Sobe o worker de geracao por IA SEM ABRIR JANELA NENHUMA.
'
'  Mesmo padrao de servico.vbs / tunnel.vbs da bridge, de proposito: e o
'  jeito que ja funciona nesta maquina, e um segundo mecanismo diferente
'  so criaria duas coisas para lembrar de manter.
'
'  O Windows nao tem "node sem console": rodar node direto sempre pisca
'  uma janela preta, e fechar essa janela mata o processo. O terceiro
'  parametro do Run (0) resolve - o processo existe, a janela nao.
'
'  ANTES DE SUBIR, CONFERE SE JA EXISTE UM SUPERVISOR.
'
'  Sem isso, a tarefa agendada mais qualquer execucao manual acumulariam
'  supervisores vigiando o mesmo worker. (O worker em si tem trava
'  propria - escuta a porta 8477 e sai se ela estiver ocupada - mas a
'  trava dele nao impede supervisores sobrando.)
' ====================================================================

Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set achados = wmi.ExecQuery( _
  "SELECT ProcessId FROM Win32_Process WHERE Name = 'cmd.exe' AND CommandLine LIKE '%" _
  & Replace(pasta, "\", "\\") & "\\servico-geracao.bat%'")

If achados.Count > 0 Then
  WScript.Quit 0   ' ja tem quem vigie
End If

Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = pasta
sh.Run "cmd /c """ & pasta & "\servico-geracao.bat""", 0, False
