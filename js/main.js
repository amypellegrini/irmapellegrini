(function() {
  var contactBtn = $('#contact');
      contactForm = $('#contact-form');

  contactBtn.on('click', function(ev) {
    ev.preventDefault();
    $(contactForm).removeClass('hidden');
    return false;
  });

  contactForm.find('form').parsley();
}());
