/*
 *
 * Request Handlers
 *
 */

// Dependencies
var _data = require('./data');
var helpers = require('./helpers');
var config = require('./config');

// Define the handlers
var handlers = {};

// Ping Handler
handlers.ping = function(data,callback){
	callback(200);
};

// Not found handler
handlers.notFound = function(data,callback){
	callback(404);
};

// Buy Handler
handlers.buy = function(data,callback){
	var userPhone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim() : false;
	var product = typeof(data.payload.id) == 'string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
	var quantity = typeof(data.payload.quantity) == 'number' && data.payload.quantity > 0 ? data.payload.quantity : false;

	// Error if purchase info is invalic
	if(userPhone && product && quantity){

		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Verify Token
		handlers._tokens.verifyToken('tokens',token,userPhone,function(tokenIsValid){
			if(tokenIsValid){

				// Check if the product is available
				_data.read('products',product,function(err,productData){
					if(!err && productData){

						// Check the inventory
						if(productData.stock >= quantity){

							// Update the inventory
							productData.stock = productData.stock - quantity;

							// Calculate Bill
							var originalPrice = productData.price*quantity;
							var totalPrice = originalPrice;
							var quantaPrice = totalPrice;
							var totalDiscount = 0;
							var vendorIssuedDiscount = 0;
							var userDiscount = 0;
							var noOfCoupons = [];

							var billData = {
								'totalPrice' : totalPrice,
								'quantaPrice' : quantaPrice,
								'totalDiscount' : totalDiscount,
								'coupons' : [],
								'discount' : 0,
								'noOfCoupons' : []
							};

							// Check for any coupon available for the product
							if(productData.discountable){
								_data.read('vendors',productData.vendorPhone,function(err,vendorData){
									if(!err && vendorData){
										var vendorCoupons = typeof(vendorData.coupons) == 'object' && vendorData.coupons instanceof Array && vendorData.coupons.length > 0 ? vendorData.coupons : false;

										if(vendorCoupons){
											billData.coupons = vendorCoupons;
											handlers.couponValidate(vendorPhone,billData,function(err,bill){
												if(!err && bill){
													billData = bill;
												} else {
													callback(500);
												}
												
											});
										} else {
											console.log('No Exclusive Coupons Available for the requested product');
										}
									} else {
										callback(500);
									}
								});
							}

							// Check for any coupon available at the client's disposal
							_data.read('users',userPhone,function(err,userData){
								if(!err && userData){
									// Check if user has any coupons
									var coupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array && userData.coupons.length > 0 ? userData.coupons : false;
									if(coupons){
										billData.coupons = coupons;
										handlers.couponValidate(userPhone,billData,function(err,bill){
											if(!err && bill){
												billData = bill;
											} else {
												callback(500);
											}
										});
									} else {
										console.log('No user generated coupons available')
									}


									var timestamp = Date.now();

									var day = String(date.getDate()).padStart(2,'0');
									var month = String(date.getMonth() + 1).padStart(2,'0');
									var year = date.getFullYear();
									var hours = String(date.getHours()).padStart(2,'0');
									var minutes = String(date.getMinutes()).padStart(2,'0');
									var seconds = String(date.getSeconds()).padStart(2,'0');

									var date = day+'-'+month+'-'+year+'-'+hours+'-'+minutes+'-'+seconds;
									
									// Construct a purchase reciept
									var purchase = {
										'userPhone' : userPhone,
										'purchasedProduct' : productData,
										'purchaseTime' : date,
										'priced' : billData.originalPrice,
										'discountedPrice' : billData.totalPrice,
									};

									// Update the Purchase History of the user
									userData.purchasHistory.push(purchase);

									// Generate a coupon if user purchased 5 items
									userData.itemsBoughtAfterCoupon += quantity;
									if(itemsBoughtAfterCoupon >= 5){
										handlers.generateCoupon(userPhone,function(err,data){
											if(!err){
												userCoupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array && userData.coupons.length > 0 ? userData.coupons : false;
												usedCoupons = typeof(billData.noOfCoupons) == 'object' && billData.noOfCoupons instanceof Array && billData.noOfCoupons.length > 0 ? billData.noOfCoupons : false;
												if(userCoupons && usedCoupons){
													for (var i = 0; i < userCoupons.length; i++){
														if(userCoupons[i] == usedCoupons){
															userCoupons.splice(i,1);
														}
													}
												} else {
													callback(500);
												}
												userData.coupons.push(data.coupons);

												// Update the products and users
												_data.update('products',product,productData,function(err){
													if(!err){
														_data.update('users',userPhone,userData,function(err){
															if(!err){
																callback(200,purchase);
															} else {
																callback(500,{'Error' : 'Could not update the user'})
															}
														});
													} else {
														callback(500,{'Error' : 'Could not update the products'})
													}
												});

											} else {
												callback(503,{'Error' : 'Could not generate a coupon'});
											}
										});
									}
								} else {
									callback(500,{'Error' : 'Could not find the user data'})
								}
							});
						}
						if(productData.stock > 0) {
							callback(503,{'Error' : 'Sorry there are only '+productData.stock+' of the requested product '+productData.productName});
						} else {
							callback(503,{'Error' : 'Sorry the requested product is currently unavailable'})
						}
					} else {
						callback(404,{'Error' : 'Product not found'});
					}
				});

			} else {
				callback(403,{'Error' : 'Token is invalid or has expired.'});
			}
		});


	}	else {
		callback(403,{'Error' : 'Purchase Info is invalid.'});
	}

};


// Coupon Validating Handler
handlers.couponValidate = function(phone,billData,callback){
	coupons = typeof(billData.coupons) == 'object' && billData.coupons instanceof Array && billData.coupons.length > 0 ? billData.coupons : false;
	if(coupons){
		coupons.forEach(function(couponId){
			_data.read('coupons',couponId,function(err,couponData){
				if(!err && couponData){
					// Verify Coupon
					var isCouponValid = couponData.validFrom >= Date.now() && couponData.validTill < Date.now() ? true : false
					if(isCouponValid){
						// Check if the discount is valid and save it
						var mockDiscount = typeof(couponData.discountValue) == 'number' && couponData.minPurchaseAmount < billData.quantaPrice ? couponData.discountValue : 0;
						billData.discount += mockDiscount;
						
						// Divide totalPrice by minimumum purchase amounts
						if(mockDiscount > 0){
							billData.quantaPrice = billData.quantaPrice - couponData.minPurchaseAmount;

							// Save the coupon that are applicable
							billData.noOfCoupons.push(couponId);
						}

						// Update the total price
						if(mockDiscount == 0){
							// Update totalPrice
							billData.totalPrice = billData.totalPrice - billData.discount;

						}
					} 
					
				} else {
					console.log('Could not fetch the coupon data of: '+couponId);
				}
			});
		});
	} else {
		callback(true);
	}

	callback(false,billData);
	
}

handlers.generateCoupon = function(userPhone,callback){
	var phone = typeof(userPhone) == 'string' && userPhone.trim().length == 10 ? userPhone.trim() : false;

	var couponId = helpers.createRandomString(20);

	var validFrom = Date.now();
	var index = 0;
	for(var i = 0,yearsToAdd = 0; index > 0; yearsToAdd++,i++){
		var currentYear = validFrom.getFullYear();
  	validFrom.setFullYear(currentYear + yearsToAdd);

  	index = validFrom < config.validFrom ? i : 0;
	}

	var validTill = Date.now();
	var currentYear = validTill.getFullYear();
	validTill.setFullYear(currentYear + index);

	var coupon = {
		'id' : couponId,
		'phone' : phone,
		'discountType' : 'flat',
		'discountValue' : 500,
		'validFrom' : validFrom,
		'validTill' : validTill,
		'minPurchaseAmount' : 1500
	};

	_data.create('coupons',couponId,coupon,function(err){
		if(!err){
			_data.read('users',userPhone,function(err,userData){
				if(!err && userData){
					userCoupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array && userData.coupons.length > 0 ? userData.coupons : false;
					if(userCoupons){
						userData.coupons = userCoupons;
						userData.coupons.push(couponId);
						_data.update('users',userPhone,userData,function(err){
							if(!err){
								callback(false,userData);
							} else {
								callback(err);
							}
						});
					} else {
						callback(true);
					}
				}
			});
			_data.update('users',userPhone,userData)
		} else {
			callback(err);
		}
	});


};

// Users
handlers.users = function(data,callback){						/*BTW This function is called by 'chosenHandler(data,callback)' from the server.js in case of any confusion*/
	var acceptableMethods = ['post','get','put','delete'];
	if(acceptableMethods.indexOf(data.method) > -1){
		handlers._users[data.method](data,callback);	
	} else{
		callback(405);
	}
};



// Container for the user submethods
handlers._users = {};

// Users - post
// Required data: firstName, lastName, password, phone, toAgreement
// Optional data: none
handlers._users.post = function(data,callback){
	// Coupon that all required fields are filled out
	var firstName = typeof(data.payload.firstName) == 'string' && data.payload.firstName.trim().length > 0 ? data.payload.firstName.trim(): false;
	var lastName = typeof(data.payload.lastName) == 'string' && data.payload.lastName.trim().length > 0 ? data.payload.lastName.trim(): false;
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim(): false;
	var password = typeof(data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim(): false;
	var tosAgreement = typeof(data.payload.tosAgreement) == 'boolean' && data.payload.tosAgreement == true ? true : false;

	if(firstName && lastName && phone && password && tosAgreement){
		// Make sure that the user doesnt already exist
		_data.read('users',phone,function(err,data){
			if(err){
				// Hash the password
				var hashedPassword = helpers.hash(password);

				if(hashedPassword){
					// Create the user object
					var userObject = {
					'firstName' : firstName,
					'lastName' : lastName,
					'phone' : phone,
					'hashedPassword' : hashedPassword,
					'tosAgreement' : true,
					'itemsBoughtAfterCoupon' : 0
				};
				

				// Store the user
				_data.create('users',phone,userObject,function(err){
					if(!err){
						callback(200);
					} else {
						console.log(err);
						callback(500,{'Error' : 'Could not create the new user'});
					}
				});
				

				} else {
					callback(500,{'Error' : 'Could not hash the user\'s password'});
				}
				
			} else{
				// User already exist
				callback(400,{'Error' : 'A user with that phone number already exists'});
			}
		});
	} else{
		callback(400,{'Error' : 'Missing required fields'});
	}
};

// Users - get
// Required data: phone
// Optional data: none
// @TODO Only let and authenticated user access their own object dont let them access anyone elses
handlers._users.get = function(data,callback){
	// Coupon that the phone number is valid
	var phone = typeof(data.queryStringObject.phone) == 'string' && data.queryStringObject.phone.trim().length == 10 ? data.queryStringObject.phone.trim() : false;
	if(phone){
		
		// Get the token from the headers
		var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;			/* **VERY IMPORTANT** The 'data.headers.token' has to be sent from the requestor, from the API, to authenticate the user as a valid requestor*/
		// Verify that the given token is valid for the phone number
		handlers._tokens.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the user
				_data.read('users',phone,function(err,data){
					if(!err && data){
						// Remove the hashed password from the user object before returning it to the requester
						delete data.hashedPassword;
						callback(200,data);
					} else {
						callback(404);
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
			}
		});


	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Users - put
// Required data: phone
// Optional data: firstName, lastName, password (atleast one must be specified)
handlers._users.put = function(data,callback){
	// Coupon for the required field
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim() : false;
	
	// Coupon for the optional field
	var firstName = typeof(data.payload.firstName) == 'string' && data.payload.firstName.trim().length > 0 ? data.payload.firstName.trim(): false;
	var lastName = typeof(data.payload.lastName) == 'string' && data.payload.lastName.trim().length > 0 ? data.payload.lastName.trim(): false;
	var password = typeof(data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim(): false;
	var products = typeof(data.payload.products) == 'object' && data.payload.products instanceof Array && data.payload.products.length >= 0 ? data.payload.products : false
	
	// Error if the phone is invalid
	if(phone){
		// Error if nothing is sent to update
		if(firstName || lastName || password || products){

		// Get the token from the headers
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Verify that the given token is valid for the phone number
		handlers._tokens.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the user
				_data.read('users',phone,function(err,userData){
					if(!err && userData){
						// Update the fields necessary
						if(firstName){
							userData.firstName = firstName;
						}
						if (lastName) {
							userData.lastName = lastName;
						}
						if (password) {
							userData.hashedPassword = helpers.hash(password); 
						}
						if (products) {
							userData.products.push
						}
						// Store the new updates
						_data.update('users',phone,userData,function(err){
							if(!err){
								callback(200);
							} else {
								console.log(err);
								callback(500,{'Error' : 'Could not update the user'})
							}
						});
					} else {
						callback(400,{'Error':'The specified user does not exist'});
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});

			}
		});
		} else {
			callback(400,{'Error' : 'Missing fields to update'});
		}
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}

};

// Users - delete
// Required data: phone
handlers._users.delete = function(data,callback){
	// Coupon for the required field
	var phone = typeof(data.queryStringObject.phone) == 'string' && data.queryStringObject.phone.trim().length == 10 ? data.queryStringObject.phone.trim() : false;
	if(phone){

		// Get the token from the headers
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Verify that the given token is valid for the phone number
		handlers._tokens.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the user
				_data.read('users',phone,function(err,userData){
					if(!err && userData){
						_data.delete('users',phone,function(err){
							if(!err){
								// Delete of the coupons associated with the user
								var userCoupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array ? userData.coupons : [];
								var couponsToDelete = userCoupons.length;
								if(couponsToDelete > 0){
									var couponsDeleted = 0;
									var deletionErrors = false;
									// Loop through the coupons 
									userCoupons.forEach(function(couponId){
										// Delete coupon
										_data.delete('coupons',couponId,function(err){
											if(err){
												deletionErrors = true;
											}
											couponsDeleted++;
											if(couponsDeleted == couponsToDelete){
												if(!deletionErrors){
													callback(200);
												} else {
													callback(500,{'Error' : 'Errors encountered while attempting to delete all of the user\'s coupons. All coupons may not have been deleted from the system successfully'});
												}
											}
										})
									});
								} else {
									callback(200);
								}
							} else{
								callback(500,{'Error' : 'Could not delete the specified user'})
							}
						});
					} else {
						callback(404);
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
			}
		});

	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Tokens
handlers.tokens = function(data,callback){
	var acceptableMethods = ['post','get','put','delete'];
	if(acceptableMethods.indexOf(data.method) > -1){
		handlers._tokens[data.method](data,callback);	
	} else{
		callback(405);
	}
};

// Container for all the tokens methods
handlers._tokens = {};

// Tokens - post
// Required data: phone, password
// Optional data: none
handlers._tokens.post = function(data,callback){
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim(): false;
	var password = typeof(data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim(): false;
	if(phone && password){
		// Look up the user or vendor who matches the phone number
		_data.read('users',phone,function(err,userData){
			if(!err && userData){
				// Hash the sent password, and compare the password stored in the user object
				var hashedPassword = helpers.hash(password);
				if(hashedPassword == userData.hashedPassword){
					// If valid, create a new token with a random name. Set an expiration date 1 hour in the future
					var tokenId = helpers.createRandomString(20);

					var expires = Date.now() + 1000 * 60 * 60;
					var tokenObject = {
						'phone' : phone,
						'id' : tokenId,
						'expires' : expires
					};

					// Store the token at the designated client
					_data.create('tokens',tokenId,tokenObject,function(err){
						if(!err){
							callback(200,tokenObject);
						} else{
							callback(500,{'Error' : 'Could not create a new token'})
						}
					});
				} else {
					callback(400,{'Error' : 'Password did not match the specified user\'s stored password'});
				}
			} else {
				console.log('Could not find the specified user');
			}
		});

		_data.read('vendors',phone,function(err,userData){
			if(!err && userData){
				// Hash the sent password, and compare the password stored in the user object
				var hashedPassword = helpers.hash(password);
				if(hashedPassword == userData.hashedPassword){
					// If valid, create a new token with a random name. Set an expiration date 1 hour in the future
					var tokenId = helpers.createRandomString(20);

					var expires = Date.now() + 1000 * 60 * 60;
					var tokenObject = {
						'phone' : phone,
						'id' : tokenId,
						'expires' : expires
					};

					// Store the token at the designated client
					_data.create('vendorTokens',tokenId,tokenObject,function(err){
						if(!err){
							callback(200,tokenObject);
						} else{
							callback(500,{'Error' : 'Could not create a new token'})
						}
					});
				} else {
					callback(400,{'Error' : 'Password did not match the specified vendor\'s stored password'});
				}
			} else {
				callback(400,{'Error' : 'Could not find the specified vendor'});
			}
		});


	} else {
		callback(400,{'Error' : 'Missing required field(s)'});
	}
};
// Tokens - get
// Repuired data : id
// Optional data : none
handlers._tokens.get = function(data,callback){
	// Coupon that id is valid
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){
		// Lookup the token
		_data.read('tokens',id,function(err,tokenData){
			if(!err && tokenData){
				callback(200,tokenData);
			} else {
				console.log('Could not find the specified user token');
			}
		});

		_data.read('vendorTokens',id,function(err,tokenData){
			if(!err && tokenData){
				callback(200,tokenData);
			} else {
				callback(404);
			}
		});
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};
// Tokens - put
// Required data: id, extend
// Optional data: none
handlers._tokens.put = function(data,callback){
	var id = typeof(data.payload.id) == 'string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
  	var extend = typeof(data.payload.extend) == 'boolean' && data.payload.extend == true ? true : false;
  	if(id && extend){
    	// Lookup the existing token
    	_data.read('tokens',id,function(err,tokenData){
      	if(!err && tokenData){
        	// Coupon to make sure the token isn't already expired
        	if(tokenData.expires > Date.now()){
          		// Set the expiration an hour from now
          		tokenData.expires = Date.now() + 1000 * 60 * 60;
          		// Store the new updates
          		_data.update('tokens',id,tokenData,function(err){
            		if(!err){
              			callback(200);
            		} else {
              			callback(500,{'Error' : 'Could not update the token\'s expiration.'});
            		}
          		});
        	} else {
          	callback(400,{'Error' : 'The token has already expired, and cannot be extended.'});
        		}
      	} 
    	});

    	_data.read('vendorTokens',id,function(err,tokenData){
      	if(!err && tokenData){
        	// Coupon to make sure the token isn't already expired
        	if(tokenData.expires > Date.now()){
          		// Set the expiration an hour from now
          		tokenData.expires = Date.now() + 1000 * 60 * 60;
          		// Store the new updates
          		_data.update('vendorTokens',id,tokenData,function(err){
            		if(!err){
              			callback(200);
            		} else {
              			callback(500,{'Error' : 'Could not update the token\'s expiration.'});
            		}
          		});
        	} else {
          	callback(400,{'Error' : 'The token has already expired, and cannot be extended.'});
        		}
      	} else {
        	callback(400,{'Error' : 'Specified user or vendor does not exist.'});
      		}
    	});
  	} else {
    	callback(400,{'Error': 'Missing required field(s) or field(s) are invalid.'});
  		}
};	


// Tokens - delete
// Riquired data: id
// Optional data: none
handlers._tokens.delete = function(data,callback){
	// Coupon that the id is valid
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){
		// Lookup the token
		_data.read('tokens',id,function(err,data){
			if(!err && data){
				_data.delete('tokens',id,function(err){
					if(!err){
						callback(200);
					} else{
						callback(500,{'Error' : 'Could not delete the specified token'})
					}
				});
			}
		});

		// Lookup the vendor token
		_data.read('vendorTokens',id,function(err,data){
			if(!err && data){
				_data.delete('vendorTokens',id,function(err){
					if(!err){
						callback(200);
					} else{
						callback(500,{'Error' : 'Could not delete the specified token'})
					}
				});
			} else {
				callback(404);
			}
		});
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Verify if a given id is currently valid for a given user or a vendor
handlers._tokens.verifyToken = function(id,phone,callback){	
	// Lookup the token
	_data.read('tokens',id,function(err,tokenData){
		if(!err && tokenData){
			// Coupon that the token is for the given user and has not expired
			if(tokenData.phone == phone && tokenData.expires > Date.now()){
				callback(true);
			} else {
				console.log('Token Data Phone: '+tokenData.phone+', Phone: '+phone+'')
				console.log('Expired: '+tokenData.expires > Date.now() ? 'No' : 'Yes'+'')
				callback(false);
			}
		} else {
			console.log(err);
			console.log('Token Data : '+tokenData+'')
		}
	});

	_data.read('vendorTokens',id,function(err,tokenData){
		if(!err && tokenData){
			// Coupon that the token is for the given user and has not expired
			if(tokenData.phone == phone && tokenData.expires > Date.now()){
				callback(true);
			} else {
				console.log('Token Data Phone: '+tokenData.phone+', Phone: '+phone+'')
				console.log('Expired: '+tokenData.expires > Date.now() ? 'No' : 'Yes'+'')
				callback(false);
			}
		} else {
			console.log(err);
			console.log('Token Data : '+tokenData+'')
			callback(false);
		}
	});
};



// Coupons
handlers.coupons = function(data,callback){
	var acceptableMethods = ['post','get','put','delete'];
    console.log('Coupon method:', data.method); // Debugging statement
	if(acceptableMethods.indexOf(data.method) > -1){
		if(typeof handlers._coupons[data.method] === 'function') {
			handlers._coupons[data.method](data,callback);
		} else {
			console.error(`handlers._coupons does not have method: ${data.method}`);
		}	
	} else{
		callback(405);
	}
};



// Container for all the coupons methods
handlers._coupons = {};

// Coupons - post 
// Required data: protocol, url, method, successCodes, timeoutSeconds
// Optional data: none

handlers._coupons.post = function(data,callback){
	// Validate input 
	var vendorId = typeof(data.payload.vendorId) == 'string' && data.payload.vendorId.trim().length == 6 ? data.payload.vendorId.trim() : false;
	var discountType = typeof(data.payload.discountType) == 'string' && ['flat','percentage'].indexOf(data.payload.discountType) > -1 ? data.payload.discountType : percentage;
	var discountValue = typeof(data.payload.discountValue) == 'number' && discountType == 'percentage' && data.payload.discountValue >= 5 && data.payload.discountValue <=90 ? data.payload.discountValue/100 : data.payload.discountValue;
	var products = typeof(data.payload.products) == 'object' && data.payload.products instanceof Array && data.payload.products.length > 0 ? data.payload.products : []
	var validFrom = typeof(data.payload.validFrom) == 'number' && data.payload.validFrom > (Date.now() + 1000 * 60*60*24) ? data.payload.validFrom : false;
	var validTill = typeof(data.payload.validTill) == 'number' && data.payload.validTill > (Date.now() + 1000 * 60*60*24*2) ? data.payload.validTill : false;
	var minPurchaseAmount = typeof(data.payload.minPurchaseAmount) == 'number' && data.payload.timeoutSeconds % 1 === 0 && data.payload.minPurchaseAmount >= 500 ? data.payload.minPurchaseAmount : false;

	if(vendorId && discountType && discountValue && products && validFrom && validTill && minPurchaseAmount){
		// Get the token from the headers for vendor login
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Lookup the vendor by reading the token
		_data.read('vendorTokens',token,function(err,tokenData){
			if(!err && tokenData){
				var vendorPhone = tokenData.phone;

				// Lookup the vendor data
				_data.read('vendors',vendorPhone,function(err,vendorData){
					if(!err && vendorData){
						var vendorCoupons = typeof(vendorData.coupons) == 'object' && vendorData.coupons instanceof Array ? vendorData.coupons : [];

						var vendorProducts = [];

						// Check if the vendor specified any products, if not then add all the products of the vendor to the coupon
						if(products.length <= 0) {

							// List all the products, which belong to the vendor
							_data.list('products',function(err,products){
								products.forEach(function(productId){
									_data.read('products',productId,function(err,productData){
										// Assemble all the products to add to the coupon
										bufferId = typeof(productData) == 'object' && productData.vendorId == vendorData.vendorId && productData instanceof Array ? productId : [];
										vendorProducts.push(bufferId);

										// Make the product Discountable
										productData.discountable = true;
									});
								});
							});
						} else {
							vendorProducts = products;
						}
						
						if(vendorProducts <= 0){

							// Create a random id for the coupons
							var couponId = helpers.createRandomString(20);

							// Create the coupon object, and include the vendor's phone
							var couponObject = {
								'id' : couponId,
								'vendorId' : vendorId,
								'vendorPhone' : vendorPhone,
								'discountType' : discountType,
								'discountValue' : discountValue,
								'products' : vendorProducts,
								'validFrom' : validFrom,
								'validTill' : validTill,
								'minPurchaseAmount' : minPurchaseAmount
							};

							// Save the object 
							_data.create('coupons',couponId,couponObject,function(err){
								if(!err){
									// Add the couponId to the vendor object
									vendorData.coupons = vendorCoupons;
									vendorData.coupons.push(couponId);

									// Save the new vendor data
									_data.update('vendors',vendorPhone,vendorData,function(err){
										if(!err){
											// Return the data about the new coupon
											callback(200,couponObject);
										} else {
											callback(500,{'Error' : 'Could not update the vendor with the new coupon'});
										}
									});
								} else {
									callback(500,{'Error' : 'Could not create the new coupon'});
								}
							});
						} else {
							console.log('No products exists to apply coupon on')
							callback(403);
						}


					} else {
						console.log(err,{'Error' : 'vendorData does not exist'});
						callback(403);
					}
				});
			} else {
				console.log(err,{'Error' : 'tokenData does not exist'});
				callback(403);
			}

		});
		
	}

};


// Coupons - get
// Required data: id 
// Optional data: none
handlers._coupons.get = function(data,callback){
	// Coupon that the id is valid
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){
		
		// Lookup the coupon
		_data.read('coupons',id,function(err,couponData){
			if(!err && couponData){
				// Get the token from the headers
				var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;
				// Verify that the given token is valid and belongs to the vendor who created the coupon
				handlers._tokens.verifyToken(token,couponData.userPhone,function(tokenIsValid){
					if(tokenIsValid){
						// Return the coupon data
						callback(200,couponData);

					}

					else {
						console.log('Valid: '+tokenIsValid+'');
						console.log('Coupon data : '+couponData ? couponData : false+'');

						callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
					}
				});
			} else {
				callback(404);
			}
		});
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};


// Coupons - put
// Required data : id
// Optional data : phone, discountType, products, discountValue (one must be sent)
handlers._coupons.put = function(data,callback){
	// Check for the required field
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone : false;
	var id = typeof(data.payload.id) == 'string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;

	// Check for the optional field
	var extend = typeof(data.payload.extend) == 'number' && data.payload.extend > 1 ? data.payload.extend : false;
	var discountType = typeof(data.payload.discountType) == 'string' && ['flat','percentage'].indexOf(data.payload.discountType) > -1 ? data.payload.discountType : false;
	var discountValue = typeof(data.payload.discountValue) == 'number' && discountType == 'percentage' && data.payload.discountValue >= 5 && data.payload.discountValue <=90 ? data.payload.discountValue/100 : data.payload.discountValue;
	var products = typeof(data.payload.products) == 'object' && data.payload.products instanceof Array && data.payload.products.length > 0 ? data.payload.products : false;
	var minPurchaseAmount = typeof(data.payload.minPurchaseAmount) == 'number' && data.payload.minPurchaseAmount > 500 ? data.payload.minPurchaseAmount : false;

	// Check to make sure id is valid for updating optional field(s)
	if(phone && id){
		// Coupon to make sure atleast one or more optional fields are sent
		if(discountType || discountValue || products || minPurchaseAmount){
			// Lookup the coupon
			_data.read('coupons',id,function(err,couponData){
				if(!err && couponData){
					// Get the token from the headers
					var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;
					// Verify that the given token is valid and belongs to the user who created the coupon
					handlers._tokens.verifyToken(token,couponData.userPhone,function(tokenIsValid){
						if(tokenIsValid){
							// Update coupon where necessary
							if(discountType){
								couponData.discountType = discountType;
							}
							if(discountValue){
								couponData.discountValue = discountValue;
							}
							if(products){
								couponData.products = products;
							}
							if(minPurchaseAmount){
								couponData.minPurchaseAmount = minPurchaseAmount;
							}

							// Check if the request is for extending the expiration data
							if(extend){

				      	// Check to make sure the coupon isn't already expired
				      	if(couponData.validTill > Date.now()){

				        		// Set the expiration to <extend> days from now
				        		couponData.validTill = Date.now() + 1000*60*60*24*extend;

				      	} else {
				        	callback(400,{'Error' : 'The coupon has already expired, and cannot be extended.'});
				      	}
							}

							// Store the new updates
							_data.update('coupons',id,couponData,function(err){
								if(!err){
									callback(200);
								} else {
									callback(500,{'Error' : 'Could not update the coupon'});
								}
							});
						} else {
							callback(403);
						}
					});		
				} else {
					callback(400,{'Error' : 'Coupon ID did not exist'});
				}
			});
		} else {
			callback(400,{'Error' : 'Missing fields to update'});
		}
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Coupon - delete
// Required data : id
// Optional data : none
handlers._coupons.delete = function(data,callback){
	// Check for the required field
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){

		// Lookup the coupon
		_data.read('coupons',id,function(err,couponData){
			if(!err && couponData){
				// Get the token from the headers
				var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;
				var products = typeof(couponData.products) == 'object' && couponData.products instanceof Array ? couponData.products : false;


				if(couponData.vendorPhone){

					// Verify that the given token is valid for the phone number
					handlers._tokens.verifyToken(token,couponData.vendorPhone,function(tokenIsValid){
						if(tokenIsValid){
							// Delete the coupon data
							_data.delete('coupons',id,function(err){
								if(!err){
										products.forEach(function(productId){
											_data.read('products',productId,function(err,productData){
												productData.discoountable = false;
												_data.update('products',productId,productData,function(err){
													if(!err){
														console.log('The product: '+productId+' has been updated to be no longer discountable')
														callback(200)
													} else {
														callback(500,{'Error' : 'Could not update the product associated with the coupon'})
													}
												});
											});
										});

									// Lookup the user
									_data.read('users',couponData.userPhone,function(err,userData){
										if(!err && userData){
											var userCoupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array ? userData.coupons : [];

											// Remove the deleted coupon from their list of coupons
											var couponPosition = userCoupons.indexOf(id);
											if(couponPosition > -1){
												userCoupons.splice(couponPosition,1);
												
												// Resave the user data
												_data.update('users',couponData.userPhone,userData,function(err){
												if(!err){
													callback(200);
												} else{
													callback(500,{'Error' : 'Could not update the user'})
												}
												});
											} else {
												callback(500,{"Error" : "Could not find the coupon on the user\'s object, so could not remove it"});
											}
										} else {
											callback(500,{'Error' : 'Could not find the user who created the coupon, so could not remove the coupon from the list of coupons on the user object'});
										}
									});
								} else{
									callback(500,{'Error' : 'Could not delete the coupon data'});
								}
							});
						} else {
							callback(403);
						}
					});
				}
				
				if(couponData.phone){
					// Verify that the given token is valid for the phone number
					handlers._tokens.verifyToken(token,couponData.phone,function(tokenIsValid){
						if(tokenIsValid){
							// Delete the coupon data
							_data.delete('coupons',id,function(err){
								if(!err){

									// Lookup the user
									_data.read('users',couponData.phone,function(err,userData){
										if(!err && userData){
											var userCoupons = typeof(userData.coupons) == 'object' && userData.coupons instanceof Array ? userData.coupons : [];

											// Remove the deleted coupon from their list of coupons
											var couponPosition = userCoupons.indexOf(id);
											if(couponPosition > -1){
												userCoupons.splice(couponPosition,1);
												userData.coupons = userCoupons;
												
												// Resave the user data
												_data.update('users',couponData.phone,userData,function(err){
												if(!err){
													callback(200);
												} else{
													callback(500,{'Error' : 'Could not update the user'})
												}
												});
											} else {
												callback(500,{"Error" : "Could not find the coupon on the user\'s object, so could not remove it"});
											}
										} else {
											callback(500,{'Error' : 'Could not find the user whose actions created the coupon, so could not remove the coupon from the list of coupons on the user object'});
										}
									});
								} else{
									callback(500,{'Error' : 'Could not delete the coupon data'});
								}
							});
						} else {
							callback(403);
						}
					});
				} else {
					callback(500,{'Error' : 'Could not find the phone number associated with the coupon.'});
				}

			} else {
				console.log('Coupon data: '+couponData+'');
				callback(400,{'Error' : 'The specified coupon ID does not exist'})
			}
		})


	} else {
		console.log('Coupon id: '+id+'');
		callback(400,{'Error' : 'Missing required field'});
	}
};

handlers._coupons.verifyCoupon = function(){};

// Vendors
handlers.vendors = function(data,callback){						/*BTW This function is called by 'chosenHandler(data,callback)' from the server.js in case of any confusion*/
	var acceptableMethods = ['post','get','put','delete'];
	if(acceptableMethods.indexOf(data.method) > -1){
		handlers._vendors[data.method](data,callback);	
	} else{
		callback(405);
	}
};



// Container for the vendor submethods
handlers._vendors = {};

// Vendors - post
// Required data: name, businessName, password, phone, toAgreement
// Optional data: none
handlers._vendors.post = function(data,callback){
	// Coupon that all required fields are filled out
	var name = typeof(data.payload.name) == 'string' && data.payload.name.trim().length > 0 ? data.payload.name.trim(): false;
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim(): false;
	var password = typeof(data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim(): false;
	var businessName = typeof(data.payload.businessName) == 'string' && data.payload.businessName.trim().length > 0 ? data.payload.businessName.trim(): false;
	var tosAgreement = typeof(data.payload.tosAgreement) == 'boolean' && data.payload.tosAgreement == true ? true : false;
	var products = typeof(data.payload.products) == 'object' && data.payload.products instanceof Array && data.payload.products.length > 0 ? data.payload.products : [];

	// Create an alpha-numeric id for the vendor
	var vendorId = helpers.createRandomString(6);
	vendorId = vendorId.toUpperCase();

	if(name && businessName && phone && password && tosAgreement && products){
		// Make sure that the vendor doesnt already exist
		_data.read('vendors',phone,function(err,data){
			if(err){

				// Hash the password
				var hashedPassword = helpers.hash(password);

				if(hashedPassword){
					// Create the vendor object
					var vendorObject = {
					'vendorId' : vendorId,
					'phone' : phone,
					'name' : name,
					'businessName' : businessName,
					'hashedPassword' : hashedPassword,
					'tosAgreement' : true,
					'products' : [],
					'coupons' : []
					};
				

				// Store the vendor
				_data.create('vendors',phone,vendorObject,function(err){
					if(!err){
						callback(200);
					} else {
						console.log(err);
						callback(500,{'Error' : 'Could not create the new vendor'});
					}
				});
				

				} else {
					callback(500,{'Error' : 'Could not hash the vendor\'s password'});
				}
				
			} else{
				// Vendor already exist
				callback(400,{'Error' : 'A vendor with that phone number already exists'});
			}
		});
	} else{
		callback(400,{'Error' : 'Missing required fields'});
	}
};

// Vendors - get
// Required data: phone
// Optional data: none
// @TODO Only let and authenticated vendor access their own object dont let them access anyone elses
handlers._vendors.get = function(data,callback){
	// Coupon that the phone number is valid
	var phone = typeof(data.queryStringObject.phone) == 'string' && data.queryStringObject.phone.trim().length == 10 ? data.queryStringObject.phone.trim() : false;
	var vendorId = typeof(data.queryStringObject.vendorId) == 'string' && data.queryStringObject.vendorId.trim().length == 6 ? data.queryStringObject.vendorId.trim() : false;
	
	if(phone && vendorId){
		
		// Get the token from the headers
		var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;			/* **VERY IMPORTANT** The 'data.headers.token' has to be sent from the requestor, from the API, to authenticate the vendor as a valid requestor*/
		// Verify that the given token is valid for the phone number
		handlers._tokens.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the vendor
				_data.read('vendors',phone,function(err,data){
					if(data.vendorId == vendorId){
						if(!err && data){
							// Remove the hashed password from the vendor object before returning it to the requester
							delete data.hashedPassword;
							callback(200,data);
						} else {
							callback(404);
						}
					} else {
						callback(403,{'Error' : 'Specified vendorId is incorrect or does not exist.'})
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
			}
		});


	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Vendors - put
// Required data: phone
// Optional data: name, businessName, password (atleast one must be specified)
handlers._vendors.put = function(data,callback){
	// Check for the required field
	var phone = typeof(data.payload.phone) == 'string' && data.payload.phone.trim().length == 10 ? data.payload.phone.trim() : false;
	var vendorId = typeof(data.payload.vendorId) == 'string' && data.payload.vendorId.trim().length == 6 ? data.payload.vendorId.trim() : false;
	
	// Check for the optional field
	var name = typeof(data.payload.name) == 'string' && data.payload.name.trim().length > 0 ? data.payload.name.trim(): false;
	var businessName = typeof(data.payload.businessName) == 'string' && data.payload.businessName.trim().length > 0 ? data.payload.businessName.trim(): false;
	var password = typeof(data.payload.password) == 'string' && data.payload.password.trim().length > 0 ? data.payload.password.trim(): false;

	// Error if the phone is invalid
	if(phone && vendorId){
		// Error if nothing is sent to update
		if(name || businessName || password){

		// Get the token from the headers
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Verify that the given token is valid for the phone number
		handlers._token.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the vendor
				_data.read('vendors',phone,function(err,vendorData){
					if(!err && vendorData){
						if(vendorData.vendorId == vendorId){

							// Update the fields necessary
							if(name){
								vendorData.name = name;
							}
							if (businessName) {
								vendorData.businessName = businessName;
							}
							if (password) {
								vendorData.hashedPassword = helpers.hash(password); 
							}
							// Store the new updates
							_data.update('vendors',phone,vendorData,function(err){
								if(!err){
									callback(200);
								} else {
									console.log(err);
									callback(500,{'Error' : 'Could not update the vendor'})
								}
							});
						} else {
							callback(403,{'Error':'The specified vendorId is invalid, or does not exists.'})
						}
					} else {
						callback(400,{'Error':'The specified vendor does not exist'});
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});

			}
		});
		} else {
			callback(400,{'Error' : 'Missing fields to update'});
		}
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}

};

// Vendors - delete
// Required data: phone
handlers._vendors.delete = function(data,callback){
	// Coupon for the required field
	var phone = typeof(data.queryStringObject.phone) == 'string' && data.queryStringObject.phone.trim().length == 10 ? data.queryStringObject.phone.trim() : false;
	var vendorId = typeof(data.queryStringObject.vendorId) == 'string' && data.queryStringObject.vendorId.trim().length == 6 ? data.queryStringObject.vendorId.trim() : false;
	
	if(phone && vendorId){

		// Get the token from the headers
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Verify that the given token is valid for the phone number
		handlers._tokens.verifyToken(token,phone,function(tokenIsValid){
			if(tokenIsValid){
				// Lookup the vendor
				_data.read('vendors',phone,function(err,vendorData){
					if(!err && vendorData){
						if(vendorData.vendorId == vendorId){

							_data.delete('vendors',phone,function(err){
								if(!err){
									// Delete off the coupons associated with the vendor
									var vendorCoupons = typeof(vendorData.coupons) == 'object' && vendorData.coupons instanceof Array ? vendorData.coupons : [];
									var couponsToDelete = vendorCoupons.length;
									if(couponsToDelete > 0){
										var couponsDeleted = 0;
										var deletionErrors = false;
										// Loop through the coupons 
										vendorCoupons.forEach(function(couponId){
											// Delete coupon
											_data.delete('coupons',couponId,function(err){
												if(err){
													deletionErrors = true;
												}
												couponsDeleted++;
												if(couponsDeleted == couponsToDelete){
													if(!deletionErrors){
														callback(200);
													} else {
														callback(500,{'Error' : 'Errors encountered while attempting to delete all of the vendor\'s coupons. All coupons may not have been deleted from the system successfully'});
													}
												}
											})
										});
									} else {
										callback(200);
									}


								} else{
									callback(500,{'Error' : 'Could not delete the specified vendor'})
								}
							});
						} else {
							callback(403,{'Error':'The specified vendorId is invalid, or does not exists.'})
						}
					} else {
						callback(404);
					}
				});
			} else {
				callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
			}
		});

	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};


// Container for all the products methods
handlers._products = {};

// Products - post 
// Required data: productName, url, method, successCodes, timeoutSeconds
// Optional data: none

handlers._products.post = function(data,callback){
	// Validate input 
	var productName = typeof(data.payload.productName) == 'string' && data.payload.productName.trim().length > 0 ? data.payload.productName.trim() : false;
	var category = typeof(data.payload.category) == 'string' && data.payload.category.trim().length > 0 ? data.payload.category.trim(): false;
	var price = typeof(data.payload.price) == 'number' ? data.payload.price : false;
	var stock = typeof(data.payload.stock) == 'number' && data.payload.stock > 0 ? data.payload.stock : false;
	var discountable = typeof(data.payload.discountable) == 'boolean' && data.payload.discountable == true ? true : false


	if(productName && category && price && stock && discountable){
		// Get the token from the headers
		var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

		// Lookup the vendor by reading the token
		_data.read('vendorTokens',token,function(err,tokenData){
			if(!err && tokenData){
				var vendorPhone = tokenData.phone;

				// Lookup the vendor data
				_data.read('vendors',vendorPhone,function(err,vendorData){
					if(!err && vendorData){
						var vendorProducts = typeof(vendorData.products) == 'object' && vendorData.products instanceof Array ? vendorData.products : [];
						var vendorId = typeof(vendorData.vendorId) == 'string' && vendorData.vendorId.trim().length == 6 ? vendorData.vendorId.trim() : false
						// Create a random id for the products
						var productId = helpers.createRandomString(20);

						// Check if the vendorId exists
						if(vendorId){
							// Create the product object, and include the vendor's phone
							var productObject = {
								'id' : productId,
								'productName' : productName,
								'category' : category,
								'price' : method,
								'stock' : successCodes,
								'timeoutSeconds' : timeoutSeconds,
								'vendorId' : vendorId,
								'vendorPhone' : vendorPhone
							};

							// Save the object 
							_data.create('products',productId,productObject,function(err){
								if(!err){
									// Add the productId to the vendor object
									vendorData.products = vendorProducts;
									vendorData.products.push(productId);

									// Save the new vendor data
									_data.update('vendors',vendorPhone,vendorData,function(err){
										if(!err){
											// Return the data about the new product
											callback(200,productObject);
										} else {
											callback(500,{'Error' : 'Could not update the vendor with the new product'});
										}
									});
								} else {
									callback(500,{'Error' : 'Could not create the new product'});
								}
							});
						} else {
							callback(500,{'Error' : 'Could not find Vendor ID 🤔, or Vendor ID is invalid'})
						}

					} else {
						console.log(err,{'Error' : 'vendorData does not exist'});
						callback(403);
					}
				});
			} else {
				console.log(err,{'Error' : 'tokenData does not exist'});
				callback(403);
			}

		});

	} else {
		callback(400,{'Error' : 'Missing required inputs, or inputs are invalid'});
	}

};


// Products - get
// Required data: id 
// Optional data: none
handlers._products.get = function(data,callback){
	// Product that the id is valid
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){
		
		// Lookup the product
		_data.read('products',id,function(err,productData){
			if(!err && productData){
				// Get the token from the headers
				var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;

				// Verify that the given token is valid and belongs to the vendor who issued the product
				handlers._tokens.verifyToken(token,productData.vendorPhone,function(tokenIsValid){
					if(tokenIsValid){
						// Return the product data
						callback(200,productData);

					} else {
						console.log('Valid: '+tokenIsValid+'');
						console.log('product data : '+productData ? productData : false+'');

						callback(403,{'Error' : 'Missing required token in header, or token is invalid'});
					}
				});
			} else {
				callback(404);
			}
		});
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};


// Products - put
// Required data : id
// Optional data : protocol, url, method, successCodes, timeoutSeconds (one must be sent)
handlers._products.put = function(data,callback){
	// Check for the required field
	var id = typeof(data.payload.id) == 'string' && data.payload.id.trim().length == 20 ? data.payload.id.trim() : false;
	
	// Check for the optional field
	var price = typeof(data.payload.price) == 'number' && data.payload.price >= 1 ? data.payload.price : false;
	var stock = typeof(data.payload.stock) == 'number' && data.payload.stock > 10 && data.payload.stock % 1 === 0 ? data.payload.stock : false;
	var discountable = typeof(data.payload.discountable) == 'boolean' && data.payload.discountable == true ? true : false;

	// Check to make sure id is valid
	if(id){
		// Check to make sure atleast one or more optional fields are sent
		if(price || stock || discountable){
			// Lookup the product
			_data.read('products',id,function(err,productData){
				if(!err && productData){
					_data.read
					// Get the token from the headers
					var token = typeof(data.headers.token) !== 'undefined' ? data.headers.token : false;
					// Verify that the given token is valid and belongs to the vendor who created the product
					handlers._tokens.verifyToken(token,productData.vendorPhone,function(tokenIsValid){
						if(tokenIsValid){

							// Update product where necessary
							if(price){
								productData.price = price;
							}
							if(stock){
								productData.stock = stock;
							}
							if(discountable){
								productData.discountable = discountable;
							}

							// Store the new updates
							_data.update('products',id,productData,function(err){
								if(!err){
									callback(200);
								} else {
									callback(500,{'Error' : 'Could not update the product'});
								}
							});
						} else {
							callback(403);
						}
					});		
				} else {
					callback(400,{'Error' : 'Product ID did not exist'});
				}
			});
		} else {
			callback(400,{'Error' : 'Missing fields to update'});
		}
	} else {
		callback(400,{'Error' : 'Missing required field'});
	}
};

// Product - delete
// Required data : id
// Optional data : none
handlers._products.delete = function(data,callback){
	// Check for the required field
	var id = typeof(data.queryStringObject.id) == 'string' && data.queryStringObject.id.trim().length == 20 ? data.queryStringObject.id.trim() : false;
	if(id){

		// Lookup the product
		_data.read('products',id,function(err,productData){
			if(!err && productData){
				// Get the token from the headers
				var token = typeof(data.headers.token) == 'string' ? data.headers.token : false;

				// Verify that the given token is valid for the phone number
				handlers._tokens.verifyToken(token,productData.vendorPhone,function(tokenIsValid){
					if(tokenIsValid){
						// Delete the product data
						_data.delete('products',id,function(err){
							if(!err){
								// Lookup the vendor
								_data.read('vendors',productData.vendorPhone,function(err,vendorData){
									if(!err && vendorData){
										var vendorProducts = typeof(vendorData.products) == 'object' && vendorData.products instanceof Array ? vendorData.products : [];

										// Remove the deleted product from their list of products
										var productPosition = vendorProducts.indexOf(id);
										if(productPosition > -1){
											vendorProducts.splice(productPosition,1);
											
											// Resave the vendor data
											_data.update('vendors',productData.vendorPhone,vendorData,function(err){
											if(!err){
												callback(200);
											} else{
												callback(500,{'Error' : 'Could not update the vendor'})
											}
											});
										} else {
											callback(500,{"Error" : "Could not find the product on the vendor\'s object, so could not remove it"});
										}
									} else {
										callback(500,{'Error' : 'Could not find the vendor who created the product, so could not remove the product from the list of products on the user object'});
									}
								});
							} else{
								callback(500,{'Error' : 'Could not delete the product data'});
							}
						});
					} else {
						callback(403);
					}
				});
			} else {
				console.log('Product data: '+productData+'');
				callback(400,{'Error' : 'The specified product ID does not exist'})
			}
		})


	} else {
		console.log('Product id: '+id+'');
		callback(400,{'Error' : 'Missing required field'});
	}
};




module.exports = handlers;