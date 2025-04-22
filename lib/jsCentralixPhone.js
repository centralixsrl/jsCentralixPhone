/** # jsCentralixPhone
 * Componente JS per l'utilizzo del Client WebRTC di Centralix
 *
 * @Author Mirko from Centralix
 * @Since 2023
 * @Home https://centralix.it
 * @Github  https://github.com/centralixsrl/jsCentralixPhone
 */
class EventManager {
    constructor() {
        this.listeners = {};
    }
    // Aggiungi un listener per un evento
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    // Rimuovi un listener per un evento
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }
        const index = this.listeners[event].indexOf(callback);
        if (index > -1) {
            this.listeners[event].splice(index, 1);
        }
    }
    // Attiva un evento con i dati forniti
    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }

}
class centralixVoicePhone extends EventManager {

    protocollo = "wss:/";
    dominio    = "";
    endpoint   = "/ws";
    porta     = 0;
    username   = "";
    secret     = "";

    socket     = "";
    socketStatus= 0;
    socketParameter = {};

    account = "";
    accountStatus = "";

    calls = [];
    multipleCall = false;

    MicrophoneMute = false;

    isChrome = false;
    isFirefox = false;

    constructor() {
        super();

        if(typeof JsSIP === 'undefined'){
            console.error("Devi includere la libreria JSSIP.");
            return;
        }

        this.remoteAudio = new window.Audio();
        this.remoteAudio.autoplay = true;
        this.remoteAudio.crossOrigin="anonymous";

        this.isChrome = navigator.userAgent.indexOf("Chrome") > -1;
        this.isFirefox = navigator.userAgent.indexOf("Firefox") > -1;


        //document.write('<div id="video-wrapper" style="display: none;"> <video id="remote-view" autoplay></video> <video id="local-view" autoplay muted></video> </div>');

    }

    /** # setParameters()
     * @description Questa funzione permette di settare tutte le caratteristiche dell'Interno che deve lavorare.

     * @param {string} cDominio URL del server Centralix
     * @param {number} cPorta Numero di Porta del servizio
     * @param {string} cUsername Username dell'interno
     * @param {string} cSecret Password dell'interno
     *
     * @Author Mirko Martino
     * @See https://github.com/centralixsrl/jsCentralixPhone
     * @Copyright Mirko Martino - Centralix 2023
     */
    setParameters (cDominio,cPorta=8089,cUsername,cSecret) {
        if(!cDominio){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }
        if(!cUsername){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }
        if(!cSecret){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }

        if(cDominio == location.host || cDominio == "127.0.0.1"){
            cDominio = location.host;
        }

        this.dominio = cDominio;
        this.porta = parseInt(cPorta);
        this.username = cUsername;
        this.password = cSecret;


    }


    /** # connect()
     * @description Funzione per convalidare i dati di connessione impostati tramite @setParameters() e avviare la connessione al server.
     * Nel caso di errore controllare i log javascript nel Browser.
     * @example jsCentralixPhone.connect();
     *
     * @Author Mirko Martino
     * @See https://github.com/centralixsrl/jsCentralixPhone
     * @Copyright Mirko Martino - Centralix 2023
     */
    connect() {
        if(!this.dominio){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }
        if(!this.username){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }
        if(!this.password){
            console.error("Devi settare tutti i parametri di connessione con il comando setParameters().");
            return;
        }

        this.socket = new JsSIP.WebSocketInterface(this.protocollo+this.dominio+':'+this.porta+this.endpoint);
        this.configuration = {
            sockets  : [ this.socket ],
            uri      : 'sip:'+this.username+'@'+this.dominio,
            password : this.password,
            display_name : 'Mirko Martino',
            user_agent : 'jsCentralixPhone1.1.0'
        };

        this.account = new JsSIP.UA(this.configuration);


        /* # CONNECTED
         * Questo evento viene ricevuto il socket ha stabilito la connessione al centralino.
         */
        this.account.on('connected', (e) => {
            this.socketStatus = 1;
            this.trigger('connected',{});
        });

        /* # DISCONNECTED
         * Questo evento viene ricevuto quando il socket si è disconnesso dal centralino.
         */
        this.account.on('disconnected', (e) => {
            this.socketStatus = 0;
            this.trigger('disconnected',{});

        });

        /* # REGISTERED
         * Questo evento viene ricevuto quando l'interno si è registrato al centralino.
         */
        this.account.on('registered', (e) => {
            this.accountStatus = 1;
            this.trigger('registered',{extension : this.username, registered : true});
        });

        /* # UNREGISTERED
         * Questo evento viene ricevuto quando l'interno si è disconnesso dal centralino.
         */
        this.account.on('unregistered', (e) => {
            this.accountStatus = 0;
            this.trigger('unregistered',{extension : this.username, registered : false});
        });

        /* # REGISTRATION FAILED
         * Questo evento viene ricevuto quando il centralino non puà autenticare l'interno.
         */
        this.account.on('registrationFailed', (e) => {
            this.accountStatus = 0;
            this.trigger('registrationFailed',{extension : this.username, cause : e.cause});
        });


        /* # NEW RTC SESSION
         * Questo evento viene ricevuto quando c'è una chiamata in Ingresso o Uscita.
         */

        this.account.on('newRTCSession', (ev) => {
            this.handleNewRTCSession(ev);
        });

        this.account.start();
    }

    /** # unregister()
     * @description Funzione per disconettere l'interno dal centralino.
     * @example jsCentralixPhone.unregister();
     *
     * @Author Mirko Martino
     * @See https://github.com/centralixsrl/jsCentralixPhone
     */
    unregister() {
        this.account.stop();
    }

    handleNewRTCSession(ev) {
        const newSession = ev.session;
        const sessionID = newSession.id;
        const callerID = (ev.direction === 'incoming') ? newSession.remote_identity.uri : newSession.remote_identity.uri.user;
        const callerName = (ev.direction === 'incoming') ? newSession.remote_identity.display_name : '';

        // Aggiungi la chiamata all'array delle chiamate attive
        this.calls.push({
            type        : newSession.originator,
            direction   : newSession.direction,
            sessionID   : sessionID,
            session     : newSession,
            mute        : false,
            hold        : false
        });

        newSession.on('ended', (e) => {
            this.trigger('onHangup', {
                originator : e.originator,
                message    : e.message,
                cause      : e.cause,
                sessionID  : ev.session.id // serve lato DOM per permettere di nascondre un div o altro.
            });

            this.removeCallBySessionID(sessionID);
        });

        newSession.on('failed', (e) => {

            //console.log('failed', e);

            switch(e.cause) {

                case JsSIP.C.causes.BUSY:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'BUSY'});
                    break;

                case JsSIP.C.causes.CANCEL:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'CANCEL'});
                    break;

                case JsSIP.C.causes.REJECTED:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'REJECTED'});
                    break;

                case JsSIP.C.causes.REDIRECTED:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'REDIRECTED'});
                    break;

                case JsSIP.C.causes.UNAVAILABLE:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'UNAVAILABLE'});
                    break;

                case JsSIP.C.causes.NOT_FOUND:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'NOT_FOUND'});
                    break;

                case JsSIP.C.causes.ADDRESS_INCOMPLETE:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'ADDRESS_INCOMPLETE'});
                    break;

                case JsSIP.C.causes.INCOMPATIBLE_SDP:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'INCOMPATIBLE_SDP'});
                    break;

                case JsSIP.C.causes.AUTHENTICATION_ERROR:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'AUTHENTICATION_ERROR'});
                    break;

                default:
                    this.trigger('failed', {sessionID : ev.session.id, direction : ev.direction, response:'GENERAL'});
                    break;

            }



            this.removeCallBySessionID(sessionID);
        });

        newSession.on('accepted', (e) => {
            this.trigger('onAnswer', e);
        });

        newSession.on('progress', (e) => {
            this.trigger('onRinging', {sessionID : ev.session.id, direction : ev.direction, originator : e.originator, callerid : callerID});
        });

        newSession.on('confirmed', (e) => {
            this.trigger('onConfirmed', {sessionID : ev.session.id, direction : ev.direction, originator : e.originator, callerid : callerID, ack : e.ack});
        });
        newSession.on('muted', (e) => {
            this.trigger('onMute', { sessionID: sessionID, isMuted : true});
        });
        newSession.on('unmuted', (e) => {
            this.trigger('onMute', { sessionID: sessionID, isMuted : false});
        });
        newSession.on('hold', (e) => {
            this.trigger('onHold', { sessionID: sessionID, isOnHold : true});
        });
        newSession.on('unhold', (e) => {
            this.trigger('onHold', { sessionID: sessionID, isOnHold : false});
        });






        newSession.on('peerconnection', (e) => {

            const pc = e.peerconnection;
            pc.ontrack = (event) => {
                if (!this.remoteAudio) {
                    console.error('remoteAudio is not defined');
                    return;
                }

                const remoteStream = new MediaStream();
                remoteStream.addTrack(event.track);
                this.remoteAudio.srcObject = remoteStream;
                //this.remoteAudio.play();
            };

            if(this.isChrome) {

                // Retrocompatibilità per onaddstream
                pc.onaddstream = (event) => {
                    if (!this.remoteAudio) {
                        console.error('remoteAudio is not defined');
                        return;
                    }

                    this.remoteAudio.srcObject = event.stream;
                    //this.remoteAudio.play();
                };

            } else if(this.isFirefox) {


                // Retrocompatibilità per onaddstream
                pc.ontrack  = (event) => {
                    if (!this.remoteAudio) {
                        console.error('remoteAudio is not defined');
                        return;
                    }

                    this.remoteAudio.srcObject = event.stream;
                    //this.remoteAudio.play();
                };

            } else {
                // per gli altri uguale a chrome
                // Retrocompatibilità per onaddstream
                pc.onaddstream = (event) => {
                    if (!this.remoteAudio) {
                        console.error('remoteAudio is not defined');
                        return;
                    }

                    this.remoteAudio.srcObject = event.stream;
                    //this.remoteAudio.play();
                };


            }
        });





        if(newSession.direction === 'outgoing'){

            if(this.isChrome) {

                // Retrocompatibilità per onaddstream
                newSession.connection.onaddstream = (e) => {
                    this.remoteAudio.srcObject = e.stream;
                };

            } else if(this.isFirefox) {


                newSession.connection.ontrack = (e) => {
                    this.remoteAudio.srcObject = e.streams[0];
                };

            } else {
                // per gli altri uguale a chrome
                // Retrocompatibilità per onaddstream
                newSession.connection.onaddstream = (e) => {
                    this.remoteAudio.srcObject = e.stream;
                };
            }


        }

        this.trigger('newRTCSession', {
            sessionID   : ev.session.id,
            session     : ev.session,
            callerID    : callerID,
            callerName    : callerName,
            direction   : newSession.direction,
            originator  : ev.originator
        });


    }

    removeCallBySessionID(sessionID) {
        const index = this.findCallBySessionID(sessionID);
        if (index !== -1) {
            this.calls.splice(index, 1);
        }
    }

    /** ### dial()
    * Questa funzione ti permette di effettuare una chiamata in uscita.

    dial("3333333333")

    * @var extenension Numero da chiamare
    * @var callerNum Numero con cui uscire
    * @var endpoint
    * @var localID ID della risorsa locale
    * @param remoteID ID della risorsa remota
    *
    * @Author Mirko from Centralix
     */
    dial(extension,callerNum='',endpoint='',localID,remoteID) {

        if(!this.socketStatus){
            console.error("L'interno non è collegato al centralino.");
            return
        }
        if(!this.accountStatus){
            console.error("L'interno non è collegato al centralino.");
            return;
        }

        if(!extension){
            console.error("Non è stato definito un numero da chiamare.");
            return;
        }

        if(this.calls.length >= 1){
            if(!this.multipleCall){
                console.warn("Sei già in conversazione.");
                return;
            }
        }

        try {

            // Metti tutte le chiamate attive in attesa
            this.calls.forEach(call => {
                if (call.session.isEstablished()) {
                    call.session.hold();
                    call.hold = true;
                }
            });

            var options = {
                'extraHeaders': [ 'callerNum: '+callerNum, 'endpoint: '+endpoint ],
                'mediaConstraints': {'audio': true, 'video': false},
            };

            this.account.call('sip:' + extension, options);
            console.log("Chiamata lanciata...");


        } catch (e) {

            console.warn("dial", e);

        }

    }

    /*
    # HANGUP - AGGANCIA
    Questa funzione permette di riagganciare una chiamata.

    @require sessionID - ID della sessione di chiamata.
    @Author Mirko
     */
    hangup(sessionID='') {

        if(sessionID == ''){
            console.warn("Devi specificare l'id della chiamata");
            return;
        }

        const callObjIndex = this.findCallBySessionID(sessionID);
        if (callObjIndex !== -1) {
            if( this.calls[callObjIndex].session.isEstablished() || this.calls[callObjIndex].session.isInProgress()) {
                this.calls[callObjIndex].session.terminate();
            }
        } else {
            console.warn("Nessuna chiamata trovata con l'id specificato o chiamata non stabilita");
        }


    }

    findCallBySessionID(sessionID) {
        return this.calls.findIndex(call => call.sessionID === sessionID);
    }

    answer(sessionID='') {
        let callIndex = this.findCallBySessionID(sessionID);

        if (callIndex === -1) {
            console.warn("Nessuna chiamata trovata con l'id specificato");
            return;
        }

        let session = this.calls[callIndex].session;

        // Metti tutte le chiamate attive in attesa
        this.calls.forEach((call, index) => {
            if (index !== callIndex && call.session.isEstablished()) {
                call.session.hold();
                call.hold = true;
            }
        });

        if (session.direction === 'incoming' && !session.isEstablished()) {
            session.answer({
                mediaConstraints: { audio: true, video: false }
            });

            this.trigger('answered', { sessionID: session.id });
        }
    }

    /** # HOLD
     * Questa funzione serve per mettere in Attesa il chiamante.
     *
     * @param session - Sessione a cui mandare il comando di hangup.
     */
    hold(sessionID='') {

        if(sessionID == ''){
            console.warn("Devi specificare il sessionID.");
            return;
        }

        const callObjIndex = this.findCallBySessionID(sessionID);
        if (callObjIndex !== -1 && this.calls[callObjIndex].session.isEstablished()) {
            //this.calls[callObjIndex].session.terminate();

            if (!this.calls[callObjIndex].session.isOnHold().local) {
                this.calls[callObjIndex].session.hold();
                this.calls[callObjIndex].hold = true;

            } else {
                this.calls[callObjIndex].session.unhold();
                this.calls[callObjIndex].hold = false;


            }

        }

    }


    mute(sessionID='') {

        if (!sessionID && sessionID === '') {
            console.warn("Devi specificare il sessionID.");
            return;
        }

        const callObjIndex = this.findCallBySessionID(sessionID);

        if (callObjIndex !== -1 && this.calls[callObjIndex].session.isEstablished()) {


            const senders = this.calls[callObjIndex].session.connection.getSenders();
            const audioSender = senders.find(sender => sender.track && sender.track.kind === 'audio');

            if (audioSender) {
                if (this.calls[callObjIndex].mute) {
                    audioSender.track.enabled = true;
                    this.calls[callObjIndex].mute = false;
                    this.trigger('onMute', {sessionID: sessionID, isMuted: false});
                } else {
                    audioSender.track.enabled = false;
                    this.calls[callObjIndex].mute = true;
                    this.trigger('onMute', {sessionID: sessionID, isMuted: true});
                }
            } else {
                console.error("No audio sender found to mute/unmute");
            }

        }
    }



    assistTransfer(sessionID='', extension=0) {

        if(extension == 0){
            console.warn("Non è stato specificato un interno a cui passare la chiamata.");
            return;
        }

        let callIndex = this.findCallBySessionID(sessionID);

        if (callIndex === -1) {
            console.warn("Nessuna chiamata trovata con l'id specificato");
            return;
        }

        let session = this.calls[callIndex].session;

        // Metti tutte le chiamate attive in attesa
        this.calls.forEach((call, index) => {
            if (index !== callIndex && call.session.isEstablished()) {
                call.session.hold();
                call.hold = true;
            }
        });

        try {

            let newSession = '';

            // effettuo la chiama all'interno
            var sessionToTrasfer = this.account.call(extension, {
                eventHandlers: {
                    ended: (e) => {

                        // Allora trasferisco la chiamata al termine
                        try {

                            this.calls[callIndex].session.refer(sessionToTrasfer.remote_identity.uri, {
                                requestOptions: {
                                    extraHeaders: [
                                        'Referred-By: '+this.username,
                                        'X-Transfer: assisted'
                                    ]
                                }
                            });

                            this.hangup(sessionID);

                        } catch (e) {
                            console.error("Errore : " + e);
                        }
                    }
                },
                mediaConstraints: {audio: true, video: false}
            });

        }catch (e) {

            console.warn("Non è possibile eseguire il trasferimento.");

        }
    }


    sendDTMF(sessionID='', extension=0) {

        if(extension == 0){
            console.warn("Non è stato specificato un interno a cui passare la chiamata.");
            return;
        }

        let callIndex = this.findCallBySessionID(sessionID);

        if (callIndex === -1) {
            console.warn("Nessuna chiamata trovata con l'id specificato");
            return;
        }

        let session = this.calls[callIndex].session;

        // Metti tutte le chiamate attive in attesa
        this.calls.forEach((call, index) => {
            if (index !== callIndex && call.session.isEstablished()) {
                call.session.hold();
                call.hold = true;
            }
        });

        try {

            let newSession = '';

            // effettuo la chiama all'interno
            var sessionToTrasfer = this.account.call(extension, {
                eventHandlers: {
                    ended: (e) => {

                        // Allora trasferisco la chiamata al termine
                        try {

                            this.calls[callIndex].session.refer(sessionToTrasfer.remote_identity.uri, {
                                requestOptions: {
                                    extraHeaders: [
                                        'Referred-By: '+this.username,
                                        'X-Transfer: assisted'
                                    ]
                                }
                            });

                            this.hangup(sessionID);

                        } catch (e) {
                            console.error("Errore : " + e);
                        }
                    }
                },
                mediaConstraints: {audio: true, video: false}
            });

        }catch (e) {

            console.warn("Non è possibile eseguire il trasferimento.");

        }
    }



}
const jsCentralixPhone = new centralixVoicePhone();