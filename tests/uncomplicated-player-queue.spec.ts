import UncomplicatedPlayerQueue from '../src/uncomplicated-player-queue';

let uncomplicatedPlayerQueue = new UncomplicatedPlayerQueue();

describe('Uncomplicated Player Queue tests', () => {
    /**
     * Pop, next, prev, is*Empty
     */
    test('Empty queue edge cases', () => {
        let key: number = uncomplicatedPlayerQueue.pop();
        expect(key).toBe(-1);

        let track = uncomplicatedPlayerQueue.next();
        expect(track).toBe(null);

        track = uncomplicatedPlayerQueue.prev();
        expect(track).toBe(null);

        expect(uncomplicatedPlayerQueue.isNextEmpty).toBe(true);
        expect(uncomplicatedPlayerQueue.isPrevEmpty).toBe(true);
    });
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
        const key = uncomplicatedPlayerQueue.push(track);
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
        const tracksAdded = uncomplicatedPlayerQueue.pushMany(tracks);

        // index: 0->9 => (index+1): 1->10
        tracksAdded.forEach((addedTrack, i) => {
            expect(addedTrack.key).toBe(i + 1);
        });
    });

    /**
     * Remove the last track using pop and check if it's 10
     */
    test('Remove last track', () => {
        let removedKey = uncomplicatedPlayerQueue.pop();
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

        let addedTrackKeys: number[] = uncomplicatedPlayerQueue
            .pushMany(tracks)
            .map(track => track.key || -1);
        let removedTrackKeys: number[] = uncomplicatedPlayerQueue.remove({
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
     * [possibility of them matching is in the order of 1E-50 practically 0]
     * 7. Go back 50 tracks again. Now iterate to the queue end while
     *    saving the keys in another set. This happens while shuffle is on.
     * 8. Compare the sets, if different, test fails.
     */
    test('Shuffle test', () => {
        let keysSet: Set<number> = new Set();
        let shuffleKeysSet: Set<number> = new Set();
        let plainItrKeys: number[] = [];
        let shuffleItrKeys: number[] = [];

        // clear the queue, shuffle off
        uncomplicatedPlayerQueue.clear();
        uncomplicatedPlayerQueue.shuffle = false;

        // insert 100 tracks, save their keys
        for (let i = 1; i <= 100; ++i) {
            let key: number = uncomplicatedPlayerQueue.push({
                src: new URL('http://test.url/'),
                data: {
                    prop: i,
                },
            });
            keysSet.add(key);
        }

        // iterate over 50 tracks, save keys, go back 50
        plainItrKeys.push(uncomplicatedPlayerQueue.current?.key || -1);
        for (let i = 1; i < 50; ++i)
            plainItrKeys.push(uncomplicatedPlayerQueue.next()?.key || -1);

        while (!uncomplicatedPlayerQueue.isPrevEmpty)
            uncomplicatedPlayerQueue.prev();

        // shuffle on, iterate over 50 tracks, save keys, go back 50
        uncomplicatedPlayerQueue.shuffle = true;
        shuffleItrKeys.push(uncomplicatedPlayerQueue.current?.key || -1);
        for (let i = 1; i < 50; ++i)
            shuffleItrKeys.push(uncomplicatedPlayerQueue.next()?.key || -1);

        while (!uncomplicatedPlayerQueue.isPrevEmpty)
            uncomplicatedPlayerQueue.prev();

        // compare the keys arrays to not be equal
        expect(shuffleItrKeys).not.toStrictEqual(plainItrKeys);

        // iterate over all 100 entries, save keys in set
        // (shuffle is enabled)
        shuffleKeysSet.add(uncomplicatedPlayerQueue.current?.key || -1);
        while (!uncomplicatedPlayerQueue.isNextEmpty)
            shuffleKeysSet.add(uncomplicatedPlayerQueue.next()?.key || -1);

        expect([...shuffleKeysSet].sort()).toStrictEqual([...keysSet].sort());
    });
});
