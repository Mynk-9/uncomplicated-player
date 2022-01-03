interface Players {
    sourceNode: MediaElementAudioSourceNode;
    gainNode: GainNode;
}

const BetterPlayer = (() => {
    /// instance of the player
    let instance: object;

    const init = (latencyMode: AudioContextLatencyCategory = 'playback') => {
        let AudioContext = window.AudioContext;
        const audioContext = new AudioContext({
            latencyHint: latencyMode,
        });

        let playersCount: number = 3;
        let globalGain: number = 1.0;
        let players: Players[] = Array<Players>(playersCount);
        for (let i = 0; i < playersCount; ++i) {
            players[i] = {
                sourceNode: audioContext.createMediaElementSource(new Audio()),
                gainNode: audioContext.createGain(),
            };
            players[i].sourceNode.connect(players[i].gainNode);
            players[i].gainNode.connect(audioContext.destination);
            players[i].gainNode.gain.value = globalGain;
        }

        return {};
    };

    return {
        /**
         * Creates an instance with the provided parameters. Can be only called
         * once before any call of getInstance.
         * @param {AudioContextLatencyCategory} latencyMode defaults to playback
         *              use interactive if being used for interactive audio and
         *              not simple music playing functionality.
         * @returns true if instance created, false if instance was already created
         */
        initInstance: (
            latencyMode: AudioContextLatencyCategory = 'playback'
        ): boolean => {
            if (instance) return false;
            instance = init(latencyMode);
            return true;
        },

        /**
         * Gets the already existing instance of BetterPlayer or creates new
         * instance if no existing instance is present. New instance created
         * with default parameters. Use initInstance to modify initial params.
         * @returns BetterPlayer instance
         */
        getInstance: () => {
            if (!instance) instance = init();
            return instance;
        },
    };
})();

export default BetterPlayer;
