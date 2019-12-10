function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
  var expires = "expires="+d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}


function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}
function getString(dataForm){
 
    var dataFormElements = dataForm.elements; // Reference to the form elements array.
    var textareaIndex = 0;  // The form array index for the textarea element--MIGHT NOT BE 0
    var textareaString = "";
    
    textareaString = textareaString + dataFormElements[textareaIndex].value;
   
    } // End of function getString 