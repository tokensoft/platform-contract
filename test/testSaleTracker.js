/* global artifacts, contract, it, assert, web3 */
var SaleTracker = artifacts.require('./crowdsale/SaleTracker.sol')
const assertJump = require('./helpers/assertJump')
const convertToBaseUnits = require('./helpers/convertToBaseUnits')

contract('SaleTracker', async (accounts) => {
  it('should deploy with enforce false', async () => {
    let instance = await SaleTracker.new(false)
    assert.notEqual(instance, null, 'Instance should not be null')
    assert.equal(await instance.enforceAddressMatch(), false, 'Enforce should be false')
    assert.equal(await instance.paused(), true, 'Should be paused by default')
  })

  it('should deploy with enforce true', async () => {
    let instance = await SaleTracker.new(true)
    assert.notEqual(instance, null, 'Instance should not be null')
    assert.equal(await instance.enforceAddressMatch(), true, 'Enforce should be true')
    assert.equal(await instance.paused(), true, 'Should be paused by default')
  })

  it('should allow only the owner to unpause', async () => {
    let instance = await SaleTracker.new(true)
    assert.equal(await instance.paused(), true, 'Should be paused by default')

    // Try to unpause from non-owner account
    try {
      await instance.unpause({from: accounts[5]})
      assert.fail('Non owner should fail')
    } catch (error) {
      assertJump(error)
    }

    // Should succeed from default acct
    await instance.unpause()

    assert.equal(await instance.paused(), false, 'Should not be paused')

    // Try to pause again from non-owner
    try {
      await instance.pause({from: accounts[4]})
      assert.fail('Non owner should fail')
    } catch (error) {
      assertJump(error)
    }

    await instance.pause()
    assert.equal(await instance.paused(), true, 'Should be paused')
  })

  it('should fail payment without data payload', async () => {
    let instance = await SaleTracker.new(false)
    await instance.unpause()

    try {
      await web3.eth.sendTransaction({from: accounts[9], to: instance.address, value: convertToBaseUnits(1), gas: 200000})
      assert.fail('No payload should fail')
    } catch (error) {
      assertJump(error)
    }
  })

  it('should allow non-validated payment with data payload', async () => {
    let instance = await SaleTracker.new(false)
    await instance.unpause()

    await instance.purchase(1, {from: accounts[9], value: convertToBaseUnits(1)})

    // Verify it doesn't allow no payload
    try {
      await web3.eth.sendTransaction({from: accounts[9], to: instance.address, value: convertToBaseUnits(1), gas: 200000})
      assert.fail('No payload should fail')
    } catch (error) {
      assertJump(error)
    }

    // Verify it doesn't allow 0 as payload
    try {
      await instance.purchase(0, {from: accounts[9], value: convertToBaseUnits(1)})
      assert.fail('No payload should fail')
    } catch (error) {
      assertJump(error)
    }
  })

  it('should allow validated payment with data payload', async () => {
    let instance = await SaleTracker.new(true)
    await instance.unpause()

    // Get the sha3 of the address sending the payment
    let hash = web3.sha3(accounts[9], {encoding: 'hex'})

    // Get the 0x and the first 8 chars (2 chars for 0x and 16 chars for 8 bytes)
    let trimmedHash = hash.slice(0, 18)
    console.log(trimmedHash)

    // Validate it allows the purchase
    await instance.purchase(trimmedHash, {from: accounts[9], value: convertToBaseUnits(1)})

    // Validate the same hash fails from another account
    try {
      await instance.purchase(trimmedHash, {from: accounts[2], value: convertToBaseUnits(1)})
      assert.fail('No payload should fail')
    } catch (error) {
      assertJump(error)
    }
  })

  it('should allow owner to update enforce config', async () => {
    let instance = await SaleTracker.new(true)

    assert.equal(await instance.enforceAddressMatch(), true, 'Enforce should be true')

    // Non-owner should fail to set enforce
    try {
      await instance.setEnforceAddressMatch(false, {from: accounts[2]})
      assert.fail('Non ownjer should fail')
    } catch (error) {
      assertJump(error)
    }

    // Owner should succeed
    await instance.setEnforceAddressMatch(false)

    assert.equal(await instance.enforceAddressMatch(), false, 'Enforce should be false')
  })

  it('should track purchaser addresses', async () => {
    let instance = await SaleTracker.new(false)
    await instance.unpause()

    // Ensure the purchaser count is 0 to start off with
    assert.equal((await instance.getPurchaserAddressCount()).toNumber(), 0)

    // Pay in once and ensure the values are expected
    await instance.purchase(100, {from: accounts[9], value: convertToBaseUnits(1)})
    assert.equal((await instance.getPurchaserAddressCount()).toNumber(), 1)
    assert.equal(await instance.purchaserAddresses(0), accounts[9])

    // Make a second call from the same address and ensure the count doesn't get updated
    await instance.purchase(100, {from: accounts[9], value: convertToBaseUnits(1)})
    assert.equal((await instance.getPurchaserAddressCount()).toNumber(), 1)

    // Make a couple of other purchases
    await instance.purchase(100, {from: accounts[8], value: convertToBaseUnits(5)})
    await instance.purchase(100, {from: accounts[7], value: convertToBaseUnits(1)})
    await instance.purchase(100, {from: accounts[7], value: convertToBaseUnits(2)})

    // Validate values
    assert.equal((await instance.getPurchaserAddressCount()).toNumber(), 3)

    // Validate address list
    assert.equal(await instance.purchaserAddresses(0), accounts[9])
    assert.equal(await instance.purchaserAddresses(1), accounts[8])
    assert.equal(await instance.purchaserAddresses(2), accounts[7])

    // Validate amounts in tracking map
    assert.equal(await instance.purchases(await instance.purchaserAddresses(0)), convertToBaseUnits(2))
    assert.equal(await instance.purchases(await instance.purchaserAddresses(1)), convertToBaseUnits(5))
    assert.equal(await instance.purchases(await instance.purchaserAddresses(2)), convertToBaseUnits(3))
  })
})
