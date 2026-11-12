/* Trava de segurança do administrador.
 *
 * A senha NUNCA aparece na tela: o prompt só pede a digitação.
 * Usado tanto pela galeria de fotos (gallery.js) quanto pelo mural (script.js).
 */
(function(){
  "use strict";

  var PASSWORD = "Carlos Marigela 13338457";

  function askPassword(acao){
    return window.prompt(
      "Digite a senha de administrador para " + acao + ".\n" +
      "A senha não é exibida. Se não souber, cancele."
    );
  }

  function checkPassword(pwd){
    if (!pwd) return false;
    return pwd.trim().toLowerCase() === PASSWORD.toLowerCase();
  }

  /* Mostra o pedido, valida e devolve true somente com a senha certa. */
  function exigirSenha(acao){
    return checkPassword(askPassword(acao));
  }

  /* Expõe a trava no window. Cada página também tem uma cópia de segurança,
     caso este arquivo não carregue (cache antigo, 404, ordem de script). */
  window.AdminAuth = {
    ask: askPassword,
    check: checkPassword,
    exigir: exigirSenha
  };
})();
