import {
    PrimitiveTrack,
    Track,
    Queue,
    QueueMutationCallback,
} from './uncomplicated-interfaces';

/**
 * Queue mechanism:
 * For going next we simply create a flow from next till prev, picking the
 * track from next depends on shuffle state. To go back we create a reverse
 * flow and since we are using an object for next tracks, it is guaranteed
 * that if the tracks were shuffled initially they will get back to original
 * position.
 *
 * current_track is object
 * next is map<key as string, track>
 * all others are arrays
 *
 * [history]{current_track}[next_seek]{{next}}
 *  ^     ^                 ^       ^
 * [0     n]               [0       m]
 *
 * next:
 *  1. history.push_back(current_track)
 *  2. next_seek.push_back(next.fetch_according_to_shuffle())
 *  3. current_track = next_seek.front
 *  4. next_seek.pop_front()
 *  5. next.remove_fetched_track()
 * 
 * prev:
 *  1. next.insert(next_seek.back)
 *  2. next_seek.pop_back()
 *  3. next_seek.push_front(current_track)
 *  4. current_track = history.back
 *  5. history.pop_back()
 */

class UncomplicatedPlayerQueue {
    private queue: Queue;
    private shuffleQueue: boolean;
    private tracksKeyCounter: number;
    private seekSize: number;
    // Mutation callback is called when any method called can mutate the
    // queue, effectively changing current track, seeks or the history upto
    // the seek size. Player is responsible to check for changes and adjust
    // accordingly. Hints are provided in arguments if next/prev or
    // in general a shifting is done.
    private queueMutationCallback: QueueMutationCallback;

    constructor() {
        this.queue = {
            history: [],
            curr: null,
            nextSeek: [],
            next: {},
        };
        this.shuffleQueue = false;
        this.tracksKeyCounter = 0;
        this.seekSize = 3;
        this.queueMutationCallback = (args: any[] | undefined): void => {};
    }

    /**
     * Compares comp to original, checks recursively for all properties
     * and objects as values of properties in comp with original
     * @param {Object} original original object
     * @param {Object} comp object to compare
     * @returns {Boolean} true if match, false otherwise
     */
    private recursiveCompare(
        original: Record<string, any>,
        comp: Record<string, any>
    ): boolean {
        if (comp === original) return true;

        for (const key in comp) {
            if (typeof comp[key] === 'object') {
                if (!this.recursiveCompare(original[key], comp[key]))
                    return false;
            } else if (comp[key] !== original[key]) return false;
        }

        return true;
    }

    /**
     * Refreshes the queue. Check for errors and fixes them.
     */
    private refreshQueue(): void {
        const adjustNextSeek = () => {
            let nextSeekLen: number = this.queue.nextSeek.length;

            // if nextSeek larger then remove the extra tracks and insert into next
            if (nextSeekLen > this.seekSize) {
                this.queue.nextSeek
                    .splice(this.seekSize, nextSeekLen - this.seekSize)
                    .forEach(track => {
                        this.queue.next[track.key.toString()] = track;
                    });
            }
            // if nextSeek smaller, then transfer extra tracks from next according
            // to shuffle state
            else if (nextSeekLen < this.seekSize) {
                let keys: string[] = Object.keys(this.queue.next);
                let needed: number = Math.min(
                    this.seekSize - nextSeekLen,
                    keys.length
                );

                if (this.shuffleQueue) {
                    for (let i = 0; i < needed; ++i) {
                        let random =
                            Math.floor((keys.length - i) * Math.random()) + i;
                        [keys[i], keys[random]] = [keys[random], keys[i]];
                    }
                }

                keys.slice(0, needed).forEach(key => {
                    this.queue.nextSeek.push(this.queue.next[key]);
                    delete this.queue.next[key];
                });
            }
        };

        // start with fixing next seek
        adjustNextSeek();

        // return if there is no track in nextSeek while seek length > 0
        // this means nextSeek and next both are empty and we cannot make
        // more fixes to current
        if (this.seekSize > 0 && this.queue.nextSeek.length === 0) return;

        // if current track is blank:
        //      if seek length is 0 and next has tracks:
        //          add track from next
        //      else add from nextSeek and readjust nextSeek
        // note: if nextSeek is empty then current will get null value
        if (!this.queue.curr) {
            let keys = Object.keys(this.queue.next);
            if (this.seekSize === 0 && keys.length > 0) {
                let index: number = 0;
                if (this.shuffleQueue)
                    index = Math.floor(keys.length * Math.random());
                let key = keys[index];
                this.queue.curr = this.queue.next[key];
                delete this.queue.next[key];
            } else {
                this.queue.curr = this.queue.nextSeek[0];
                this.queue.nextSeek.splice(0, 1);
                adjustNextSeek();
            }
        }
    }

    /**
     * Adds new track to the queue
     * @param {Track} track track to be added to the queue
     * @returns {number} key of added track
     */
    public push(track: PrimitiveTrack): number {
        let key = ++this.tracksKeyCounter;
        this.queue.next[key.toString()] = { ...track, key: key };
        this.refreshQueue();
        this.queueMutationCallback(['push']);
        return this.tracksKeyCounter;
    }

    /**
     * Added multiple tracks to the crew and returns the array with tracks key
     * added to each Track object.
     * @param {Track[]} tracks tracks array to be added to the queue
     * @returns {Track[]} tracks array with respective key added to each track
     */
    public pushMany(tracks: PrimitiveTrack[]): Track[] {
        let tracksAdded: Track[] = [];
        tracks.forEach(track => {
            let key = ++this.tracksKeyCounter;
            this.queue.next[key.toString()] = { ...track, key: key };
            tracksAdded.push({ ...track, key: key });
        });
        this.refreshQueue();
        this.queueMutationCallback(['pushMany']);
        return tracksAdded;
    }

    /**
     * Adds a track next up instead of queue end.
     * @param {PrimitiveTrack} track track to be added next
     * @returns {number} key of added track
     */
    public addNext(track: PrimitiveTrack): number {
        let key = ++this.tracksKeyCounter;
        this.queue.nextSeek = [{ ...track, key: key }, ...this.queue.nextSeek];
        this.refreshQueue();
        this.queueMutationCallback(['addNext']);
        return key;
    }

    /**
     * Removes the last track from the queue. Removes present track if it is
     * the last track.
     * @returns key of the removed track, if no track exists then -1
     */
    public pop(): number {
        let keys = Object.keys(this.queue.next);
        if (keys.length > 0) {
            let key = keys[keys.length - 1];
            delete this.queue.next[key];
            return parseInt(key);
        } else if (this.queue.nextSeek.length > 0) {
            let key = this.queue.nextSeek[this.queue.nextSeek.length - 1].key;
            this.queue.nextSeek.pop();
            this.queueMutationCallback(['pop']);
            return key;
        } else if (this.queue.curr) {
            let key = this.queue.curr.key;
            this.queue.curr = null;
            this.queueMutationCallback(['pop']);
            return key;
        } else {
            return -1;
        }
    }

    /**
     * Compares values in search with corresponding values in the tracks
     * of the queue. All the matches are removed.
     * @param {Object} search Object with values which should be compared.
     * @returns array of the keys of tracks removed
     */
    public remove(search: {
        key?: number;
        src?: URL;
        data?: Object;
    }): number[] {
        let removedKeys: number[] = [];

        // next:
        // apply filter to keys according to recursiveCompare
        // then use reducer to create new object from filtered keys
        this.queue.next = Object.keys(this.queue.next)
            .filter((key: string) => {
                let predicateVal = !this.recursiveCompare(
                    this.queue.next[key],
                    search
                );
                if (!predicateVal) removedKeys.push(parseInt(key));
                return predicateVal;
            })
            .reduce((newNext: { [key: string]: Track }, key: string) => {
                newNext[key] = this.queue.next[key];
                return newNext;
            }, {});

        /// nextSeek, history:
        [this.queue.nextSeek, this.queue.history] = [
            this.queue.nextSeek,
            this.queue.history,
        ].map(queueComponent =>
            queueComponent.filter(track => {
                let predicateVal = !this.recursiveCompare(track, search);
                if (!predicateVal) removedKeys.push(track.key);
                return predicateVal;
            })
        );

        /// current
        if (this.queue.curr && this.recursiveCompare(this.queue.curr, search)) {
            removedKeys.push(this.queue.curr.key);
            this.queue.curr = null;
        }

        // refresh the queue for any problems
        this.refreshQueue();

        this.queueMutationCallback(['remove']);

        return removedKeys;
    }

    /**
     * Clears the queue including now playing.
     */
    public clear(): void {
        this.queue.curr = null;
        [this.queue.nextSeek, this.queue.history] = [[], []];
        this.queue.next = {};
        this.tracksKeyCounter = 0;
        this.queueMutationCallback(['clear']);
    }

    /**
     * Advances the playlist.
     * @returns {Track} the new current track, null if no next track
     */
    public next(): Track | null {
        // return null if nextSeek is empty
        if (this.isNextEmpty) return null;

        let keys: string[] = Object.keys(this.queue.next);
        // if there are no items in next then keep exhausting nextSeek
        if (keys.length === 0) {
            if (this.queue.curr) this.queue.history.push(this.queue.curr);
            this.queue.curr = this.queue.nextSeek[0];
            this.queue.nextSeek.splice(0, 1);
            return this.queue.curr;
        }

        // select the key as per shuffle config
        let key: string = keys[0];
        if (this.shuffleQueue)
            key = keys[Math.floor(keys.length * Math.random())];

        if (this.queue.curr) this.queue.history.push(this.queue.curr);
        this.queue.nextSeek.push(this.queue.next[key]);
        this.queue.curr = this.queue.nextSeek[0];
        this.queue.nextSeek.splice(0, 1);
        delete this.queue.next[key];

        this.queueMutationCallback(['next']);

        return this.queue.curr;
    }

    /**
     * Checks if there are more tracks ahead.
     * @returns {boolean} true if no next tracks available
     */
    public get isNextEmpty(): boolean {
        // if seekSize is zero then check next otherwise check nextSeek
        if (this.seekSize > 0) return this.queue.nextSeek.length === 0;
        else return Object.keys(this.queue.next).length === 0;
    }

    /**
     * Retreats the playlist.
     * @returns {Track} the new current track if exists, otherwise null
     */
    public prev(): Track | null {
        if (this.queue.history.length === 0) return null;

        if (this.queue.curr)
            this.queue.nextSeek = [this.queue.curr, ...this.queue.nextSeek];
        let track = this.queue.nextSeek.pop();
        if (track) this.queue.next[track.key.toString()] = track;
        track = this.queue.history.pop();
        // have to make this extra check because typescript throws error otherwise
        // even though track is guaranteed to be not undefined
        if (track) this.queue.curr = track;

        this.queueMutationCallback(['prev']);

        return this.queue.curr;
    }

    /**
     * Checks if there are more tracks behind.
     * @returns {boolean} true if no previous available
     */
    public get isPrevEmpty(): boolean {
        return this.queue.history.length === 0;
    }

    /**
     * Brings queue to start.
     */
    public reset(): void {
        const addToNext = (track: Track) => {
            this.queue.next[track.key.toString()] = track;
        };
        this.queue.history.forEach(addToNext);
        this.queue.nextSeek.forEach(addToNext);
        if (this.queue.curr)
            this.queue.next[this.queue.curr.key.toString()] = this.queue.curr;

        this.queue.history = [];
        this.queue.curr = null;
        this.queue.nextSeek = [];

        this.refreshQueue();
        this.queueMutationCallback(['reset']);
    }

    /**
     * Gets the current track data. Null if no current track is available to be
     * set to current.
     */
    public get current(): Track | null {
        if (!this.queue.curr) this.refreshQueue();
        return this.queue.curr;
    }

    /**
     * Get size of seek array.
     */
    public get seekLength(): number {
        return this.seekSize;
    }

    /**
     * Set size of seek array.
     */
    public set seekLength(len: number) {
        this.seekSize = len;
        this.refreshQueue();
        this.queueMutationCallback(['seekLength']);
    }

    /**
     * Get the next and previous seeks.
     * [...............]       [...........]
     *  0.............n         0.........n
     *        prev                  next
     *  oldest...recent         next...last
     */
    public get seek(): { next: Track[]; prev: Track[] } {
        let nextSeek: Track[] = this.queue.nextSeek;
        let prevSeek: Track[] = [];
        let prevSeekSize = Math.min(this.seekSize, this.queue.history.length);

        for (let i = 1; i <= prevSeekSize; ++i)
            prevSeek.push(this.queue.history[this.queue.history.length - i]);

        return {
            next: nextSeek,
            prev: prevSeek,
        };
    }

    /**
     * Sets seek length to default. Default is 3.
     */
    public setDefaultSeekLength(): void {
        this.seekSize = 3;
        this.refreshQueue();
        this.queueMutationCallback(['setDefaultSeekLength']);
    }

    /**
     * Gets the playlist shuffle enabled/disabled state.
     */
    public get shuffle(): boolean {
        return this.shuffleQueue;
    }

    /**
     * Sets the playlist shuffle enabled/disabled state. Refreshes next seek
     * if state changed.
     */
    public set shuffle(shuffleEnable: boolean) {
        if (shuffleEnable === this.shuffleQueue) return;

        this.shuffleQueue = shuffleEnable;
        this.queue.nextSeek.forEach(track => {
            this.queue.next[track.key.toString()] = track;
        });
        this.queue.nextSeek = [];
        this.refreshQueue();
        this.queueMutationCallback(['shuffle']);
    }

    /**
     * Sets mutation callback replacing the previous one. End-developer should
     * avoid using this setter.
     */
    public set _mutationCallback(newMutationCallback: QueueMutationCallback) {
        this.queueMutationCallback = newMutationCallback;
    }
}

export default UncomplicatedPlayerQueue;
