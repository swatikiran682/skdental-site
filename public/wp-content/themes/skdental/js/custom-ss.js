jQuery(document).ready(function ( $ ) {
	$(".custom-ss-submit").click(function(){
		  var emailReg=/^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
		  var user_email = $("#custom-ss-email").val();
		  var user_name = $("#custom-ss-name").val();
		  var user_phone = $("#custom-ss-phone").val();
		  var user_message = $("#custom-ss-message").val();
	        if(user_email == ''){
			$("#custom-ss-email").addClass('custom-ss-border-error');
			return false;
		}  
	    if(!emailReg.test(user_email)){
	        $("#custom-ss-email").addClass('custom-ss-border-error');
	  	  return false;
	    }else{
	  	  $("#custom-ss-email").removeClass('custom-ss-border-error'); 
	    }
		  if(user_message == '' ||user_message==null ){
			  $("#custom-ss-message").addClass('custom-ss-border-error');
			  return false;
		  }else{
			  $("#custom-ss-message").removeClass('custom-ss-border-error');  
		  }
		var data = {
				     action:"contact_form_data_action",
					 name:user_name,
				     email:user_email,
				     phone:user_phone,
				     message: user_message
					};

		   $.post(my_ajax_object.ajaxurl, data, function(response) {
			   $("#custom-ss-contact-form")[0].reset();
			   if(response == 1){
			   alert("Your Feedback Submitted Successfully");
			   }else{
				   alert("Network Error");
			   }
		 });
	});
});
