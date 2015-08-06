(function() {
  var
      contactBtn = $('#contact'),
      contactForm = $('#contact-form'),

      hideContactForm = function(ev) {
        if (ev.target === contactForm[0] ||
            $(ev.target).closest('#contact-form')[0]) {
          ev.stopPropagation();
          return false;
        }
        $(contactForm).addClass('hidden');
      },

      showContactForm = function(ev) {
        ev.preventDefault();
        $(contactForm).removeClass('hidden');

        return false;
      };

  contactBtn.on('click', showContactForm);
  $(document).on('click', hideContactForm);
  contactForm.find('form').parsley();
}());
