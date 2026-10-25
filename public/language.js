if(!/^\/(en|ru)(\/|$)/.test(location.pathname)){const lang=location.hostname.endsWith('.com')?'en':'ru';location.replace('/'+lang+location.pathname)}
