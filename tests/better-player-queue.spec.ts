import BetterPlayerQueue from '../src/better-player-queue';

let betterPlayerQueue = new BetterPlayerQueue();

describe('better-player-queue tests', () => {
    /**
     * Add single track. Key should be zero since queue is empty.
     */
    test('Add one track', () => {
        let track = {
            src: new URL('http://test.com'),
            data: {
                name: 'test0',
            },
        };
        const key = betterPlayerQueue.push(track);
        expect(key).toBe(0);
    });

    /**
     * Add multiple tracks. Check for their keys to be from 1-10.
     */
    test('Add multiple tracks', () => {
        let tracks = [];
        for (let i = 1; i <= 10; ++i) {
            tracks.push({
                src: new URL(`http://test.com/${i}`),
                data: {
                    name: `test${i}`,
                },
            });
        }
        const tracksAdded = betterPlayerQueue.pushMany(tracks);

        // index: 0->9 => (index+1): 1->10
        tracksAdded.forEach((addedTrack, i) => {
            expect(addedTrack.key).toBe(i + 1);
        });
    });

    /**
     * Remove the last track using pop and check if it's 10
     */
    test('Remove last track', () => {
        let removedKey = betterPlayerQueue.pop();
        expect(removedKey).toBe(10);
    });

    /**
     * First add 10 new tracks and then remove them.
     */
    test('Remove multiple tracks', () => {
        let tracks = [];
        for (let i = 0; i < 10; ++i) {
            tracks.push({
                src: new URL(`http://xyz.abc/${i}`),
                data: {
                    filteringData: 'filter',
                },
            });
        }

        let addedTrackKeys: number[] = betterPlayerQueue
            .pushMany(tracks)
            .map(track => track.key || -1);
        let removedTrackKeys: number[] = betterPlayerQueue.remove({
            data: {
                filteringData: 'filter',
            },
        });

        expect(removedTrackKeys).toStrictEqual(addedTrackKeys);
    });

    /**
     * Follow steps:
     * 1. Disable shuffle. Clear the queue.
     * 2. Add 100 tracks and save their consecutive keys in a set.
     * 3. Iterate over 50 tracks without shuffle. Save consecutive keys.
     * 4. Go back 50 tracks. Enable shuffle.
     * 5. Iterate over 50 tracks. Save the consecutive keys.
     * 6. Check if the keys arrays match. If match then test fail.
     * 7. Go back 50 tracks again. Now iterate to queue end while
     *    saving the keys in another set.
     * 8. Compare the sets, if different, test fails.
     */
    test('Shuffle test', () => {
        let keysSet: Set<number> = new Set();
        let shuffleKeysSet: Set<number> = new Set();
        let plainItrKeys: number[] = [];
        let shuffleItrKeys: number[] = [];

        let shuffle_arr = [];
        let plain_arr = [];

        // clear the queue
        betterPlayerQueue.clear();

        // shuffle off, insert 100 tracks, save their keys
        betterPlayerQueue.shuffle = false;
        for (let i = 1; i <= 100; ++i) {
            let key: number = betterPlayerQueue.push({
                src: null,
                data: {
                    prop: i,
                },
            });
            keysSet.add(key);
            plain_arr.push(key);
        }

        // iterate over 50 tracks, save keys, go back 50
        for (let i = 0; i < 50; ++i) {
            let tmp = betterPlayerQueue.next()?.key;
            plainItrKeys.push(tmp != undefined ? tmp : -1);
        }
        while (!betterPlayerQueue.isPrevEmpty) betterPlayerQueue.prev();

        // shuffle on, iterate over 50 tracks, save keys, go back 50
        betterPlayerQueue.shuffle = true;
        for (let i = 0; i < 50; ++i) {
            let tmp = betterPlayerQueue.next()?.key;
            tmp = tmp != undefined ? tmp : -1;
            shuffleItrKeys.push(tmp);
        }
        while (!betterPlayerQueue.isPrevEmpty) betterPlayerQueue.prev();

        // compare the keys arrays
        expect(shuffleItrKeys).not.toStrictEqual(plainItrKeys);

        // iterate over all 100 entries, save keys in set
        // (shuffle is enabled)
        while (!betterPlayerQueue.isNextEmpty) {
            let data = betterPlayerQueue.next();
            let key: number = data?.key != undefined ? data.key : -1;
            shuffleKeysSet.add(key);
            shuffle_arr.push(key);
            if (key === -1) console.log(data);
        }

        expect([...shuffleKeysSet].sort()).toStrictEqual([...keysSet].sort());
    });
});
